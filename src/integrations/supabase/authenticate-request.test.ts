import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { authenticateRequest, decodeJwtPayload } from "./authenticate-request.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "22222222-2222-4222-8222-222222222222";

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function token(sub: string): string {
  return `${base64Url({ alg: "HS256", typ: "JWT" })}.${base64Url({ sub, email: "a@b.test", role: "authenticated" })}.signature-not-checked-locally`;
}

function request(accessToken: string): Request {
  return new Request("https://app.test/_serverFn/x", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

type Fixture = {
  userStatus?: number;
  userEmail?: string;
  profile?: { is_active: boolean; tenant_id: string | null } | null;
  roles?: { role: string }[];
  rolesStatus?: number;
  platform?: { role: string } | null;
};

let calls: string[];
let inFlight: number;
let maxDatabaseInFlight: number;
const originalFetch = globalThis.fetch;

function stubSupabase(fixture: Fixture) {
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const singleObject =
      input instanceof Request && input.headers.get("accept")?.includes("vnd.pgrst.object");
    const resource = url.pathname.replace(/^\/(auth|rest)\/v1\//, "");
    calls.push(resource);
    inFlight += 1;
    if (url.pathname.startsWith("/rest/"))
      maxDatabaseInFlight = Math.max(maxDatabaseInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;

    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    const rows = (row: unknown) => (singleObject ? json(row) : json(row ? [row] : []));

    if (resource === "user") {
      return fixture.userStatus
        ? json({ msg: "invalid JWT" }, fixture.userStatus)
        : json({
            id: USER_ID,
            email: fixture.userEmail ?? "person@gmail.com",
            aud: "authenticated",
          });
    }
    if (resource === "profiles") {
      return rows(
        fixture.profile === undefined ? { is_active: true, tenant_id: TENANT_ID } : fixture.profile,
      );
    }
    if (resource === "user_roles") {
      return fixture.rolesStatus
        ? json({ message: "denied" }, fixture.rolesStatus)
        : json(fixture.roles ?? [{ role: "recruiter" }]);
    }
    if (resource === "platform_admins") return rows(fixture.platform ?? null);
    return json({ message: `unexpected ${resource}` }, 500);
  };
}

beforeEach(() => {
  calls = [];
  inFlight = 0;
  maxDatabaseInFlight = 0;
  process.env.SUPABASE_URL = "https://project.supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.AUTH_ALLOWED_WORK_EMAIL_DOMAINS = "staffinix.test";
  delete process.env.AUTH_EMAIL_ALLOWLIST;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("authenticates with one Auth call, then reads profile and roles in parallel", async () => {
  stubSupabase({ roles: [{ role: "recruiter" }] });

  const context = await authenticateRequest(request(token(USER_ID)));

  assert.equal(context.userId, USER_ID);
  assert.equal(context.tenantId, TENANT_ID);
  assert.equal(context.claims.sub, USER_ID);
  assert.deepEqual(context.access, { roles: ["recruiter"], platformRole: null });
  assert.deepEqual([...calls].sort(), ["platform_admins", "profiles", "user", "user_roles"]);
  assert.equal(calls[0], "user", "the token must be verified before any database read");
  assert.equal(maxDatabaseInFlight, 3, "profile and role reads must run concurrently");
});

test("rejects a token Supabase Auth does not accept", async () => {
  stubSupabase({ userStatus: 401 });
  await assert.rejects(authenticateRequest(request(token(USER_ID))), {
    name: "UnauthorizedError",
  });
  assert.deepEqual(calls, ["user"], "no database read after a rejected token");
});

test("rejects a token whose subject differs from the verified user", async () => {
  stubSupabase({});
  await assert.rejects(
    authenticateRequest(request(token("33333333-3333-4333-8333-333333333333"))),
    { name: "UnauthorizedError" },
  );
});

test("rejects inactive and missing profiles", async () => {
  stubSupabase({ profile: { is_active: false, tenant_id: TENANT_ID } });
  await assert.rejects(authenticateRequest(request(token(USER_ID))), { name: "ForbiddenError" });

  stubSupabase({ profile: null });
  await assert.rejects(authenticateRequest(request(token(USER_ID))), { name: "ForbiddenError" });
});

test("non-work email needs a role or platform membership", async () => {
  stubSupabase({ userEmail: "person@outlook.com", roles: [], platform: null });
  await assert.rejects(authenticateRequest(request(token(USER_ID))), { name: "ForbiddenError" });

  stubSupabase({ userEmail: "person@outlook.com", roles: [{ role: "admin" }] });
  assert.equal((await authenticateRequest(request(token(USER_ID)))).userId, USER_ID);

  stubSupabase({
    userEmail: "person@outlook.com",
    roles: [],
    platform: { role: "platform_owner" },
  });
  assert.equal(
    (await authenticateRequest(request(token(USER_ID)))).access?.platformRole,
    "platform_owner",
  );
});

test("an unreadable role list leaves access unknown so feature checks deny", async () => {
  stubSupabase({ userEmail: "person@staffinix.test", rolesStatus: 500 });
  assert.equal((await authenticateRequest(request(token(USER_ID)))).access, null);

  stubSupabase({ userEmail: "person@outlook.com", rolesStatus: 500 });
  await assert.rejects(authenticateRequest(request(token(USER_ID))), { name: "ForbiddenError" });
});

test("decodes base64url JWT payloads including non-ASCII text", () => {
  const payload = { sub: USER_ID, name: "José Müller" };
  assert.deepEqual(decodeJwtPayload(`x.${base64Url(payload)}.y`), payload);
});
