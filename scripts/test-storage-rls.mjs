import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";

const status = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8" });
const env = Object.fromEntries(
  status
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].replace(/"$/, "")]),
);

const apiUrl = env.API_URL;
const anonKey = env.ANON_KEY;
const serviceKey = env.SERVICE_ROLE_KEY;
const jwtSecret = env.JWT_SECRET;

if (![apiUrl, anonKey, serviceKey, jwtSecret].every(Boolean)) {
  throw new Error("Supabase local credentials are unavailable");
}

const runId = `${Date.now()}-${process.pid}`;
const password = "Storage-RLS-test-password-42!";
const tenantA = crypto.randomUUID();
const tenantB = crypto.randomUUID();
const candidateA = crypto.randomUUID();
const pathA = `${tenantA}/${candidateA}/resume-a.pdf`;
const pathB = `${tenantB}/${crypto.randomUUID()}/resume-b.pdf`;
const createdUsers = [];
let checks = 0;

function headers(key, token = key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${token}`, ...extra };
}

async function request(path, options = {}) {
  return fetch(`${apiUrl}${path}`, options);
}

async function jsonRequest(path, { key = serviceKey, token = key, method = "GET", body } = {}) {
  const response = await request(path, {
    method,
    headers: headers(key, token, body === undefined ? {} : { "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { response, data: text ? JSON.parse(text) : null };
}

function assert(condition, message) {
  checks += 1;
  if (!condition) throw new Error(`Storage RLS check failed: ${message}`);
  process.stdout.write(`ok ${checks} - ${message}\n`);
}

async function createUser(label) {
  const email = `storage-${label}-${runId}@example.invalid`;
  const { response, data } = await jsonRequest("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password, email_confirm: true },
  });
  if (!response.ok) throw new Error(`Could not create ${label}: ${JSON.stringify(data)}`);
  createdUsers.push(data.id);
  return { id: data.id, email };
}

async function signIn(user) {
  const { response, data } = await jsonRequest("/auth/v1/token?grant_type=password", {
    key: anonKey,
    token: anonKey,
    method: "POST",
    body: { email: user.email, password },
  });
  if (!response.ok) throw new Error(`Could not sign in ${user.email}`);
  return data.access_token;
}

async function storageUpload(path, token, content) {
  return request(`/storage/v1/object/resumes/${path}`, {
    method: "POST",
    headers: headers(anonKey, token, { "Content-Type": "application/pdf", "x-upsert": "false" }),
    body: Buffer.from(content),
  });
}

async function storageDownload(path, token, key = anonKey) {
  return request(`/storage/v1/object/authenticated/resumes/${path}`, {
    headers: headers(key, token),
  });
}

function expiredToken(userId) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const head = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: userId,
    role: "authenticated",
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) - 60,
  });
  const signature = createHmac("sha256", jwtSecret)
    .update(`${head}.${payload}`)
    .digest("base64url");
  return `${head}.${payload}.${signature}`;
}

try {
  const userA = await createUser("tenant-a");
  const userB = await createUser("tenant-b");

  let result = await jsonRequest("/rest/v1/tenants", {
    method: "POST",
    body: [
      { id: tenantA, name: "Storage RLS Tenant A", slug: `storage-a-${runId}` },
      { id: tenantB, name: "Storage RLS Tenant B", slug: `storage-b-${runId}` },
    ],
  });
  assert(result.response.ok, "test tenants created");

  for (const [userId, tenantId] of [
    [userA.id, tenantA],
    [userB.id, tenantB],
  ]) {
    result = await jsonRequest(`/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      body: { tenant_id: tenantId, is_active: true },
    });
    assert(
      result.response.ok,
      `active profile assigned to ${tenantId === tenantA ? "Tenant A" : "Tenant B"}`,
    );
  }

  result = await jsonRequest("/rest/v1/candidates", {
    method: "POST",
    body: {
      id: candidateA,
      first_name: "Storage",
      last_name: "Candidate A",
      tenant_id: tenantA,
      created_by: userA.id,
    },
  });
  assert(result.response.ok, "Tenant A candidate created");

  let bucket = await jsonRequest("/storage/v1/bucket", {
    method: "POST",
    body: { id: "resumes", name: "resumes", public: false },
  });
  if (!bucket.response.ok && bucket.response.status !== 409)
    throw new Error(`Could not create private resumes bucket: ${JSON.stringify(bucket.data)}`);
  bucket = await jsonRequest("/storage/v1/bucket/resumes", {
    method: "PUT",
    body: { public: false },
  });
  assert(bucket.response.ok, "resumes bucket is explicitly private");

  const tokenA = await signIn(userA);
  const tokenB = await signIn(userB);

  let response = await storageUpload(pathA, tokenA, "tenant-a-resume");
  assert(response.ok, "Tenant A user uploads Tenant A resume");
  response = await storageUpload(pathB, tokenB, "tenant-b-resume");
  assert(response.ok, "Tenant B user uploads Tenant B resume");

  response = await storageDownload(pathA, tokenA);
  assert(
    response.ok && (await response.text()) === "tenant-a-resume",
    "Tenant A user downloads Tenant A resume",
  );
  response = await storageDownload(pathB, tokenA);
  assert(!response.ok, "Tenant A user cannot download Tenant B resume");
  response = await storageUpload(`${tenantB}/guessed/forged.pdf`, tokenA, "forged");
  assert(!response.ok, "Tenant A user cannot upload into guessed Tenant B path");
  response = await storageDownload(pathB, tokenA);
  assert(!response.ok, "knowing the exact Tenant B object path grants no access");

  response = await request(`/storage/v1/object/authenticated/resumes/${pathA}`, {
    headers: { apikey: anonKey },
  });
  assert(!response.ok, "anonymous authenticated-download request is denied");
  response = await request(`/storage/v1/object/public/resumes/${pathA}`, {
    headers: { apikey: anonKey },
  });
  assert(!response.ok, "direct public download URL is denied for private resume bucket");
  response = await storageDownload(pathA, expiredToken(userA.id));
  assert(!response.ok, "expired session token is denied by the Storage API");

  result = await jsonRequest(`/rest/v1/candidates?id=eq.${candidateA}`, {
    key: anonKey,
    token: tokenA,
    method: "PATCH",
    body: { tenant_id: tenantB },
  });
  assert(!result.response.ok, "candidate ownership cannot be changed from Tenant A to Tenant B");
  response = await storageDownload(pathB, tokenA);
  assert(!response.ok, "failed ownership mutation does not unlock Tenant B resume");

  result = await jsonRequest(`/rest/v1/profiles?id=eq.${userA.id}`, {
    method: "PATCH",
    body: { is_active: false },
  });
  assert(result.response.ok, "Tenant A user marked inactive");
  response = await storageDownload(pathA, tokenA);
  assert(!response.ok, "inactive user is denied despite a previously valid session");

  process.stdout.write(`1..${checks}\n`);
} finally {
  for (const userId of createdUsers) {
    await request(`/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: headers(serviceKey),
    }).catch(() => {});
  }
}
