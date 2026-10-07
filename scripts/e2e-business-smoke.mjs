import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

for (const path of [".env.local", ".env"]) {
  if (existsSync(path)) process.loadEnvFile(path);
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.STAFFINIX_E2E_PASSWORD;

assert.ok(url, "SUPABASE_URL is required");
assert.ok(key, "SUPABASE_PUBLISHABLE_KEY is required");
assert.ok(password, "STAFFINIX_E2E_PASSWORD is required");

const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

async function signIn(email) {
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  assert.ok(data.user, `Authentication failed for ${email}`);
  return { client, user: data.user };
}

const recruiter = await signIn("manideepstaff@gmail.com");
const developer = await signIn("manistaff@gmail.com");
const administrator = await signIn("manideep@gmail.com");
const created = { candidateIds: [], vendorIds: [], avatarPath: null };
const results = {};

try {
  const vendorPayload = {
    name: `E2E Vendor ${runId}`,
    contact_name: "Automation Contact",
    contact_email: `e2e-${runId}@example.com`,
    contact_phone: "+13175550199",
    linkedin_id: "https://www.linkedin.com/in/staffinix-e2e",
    contact_role: "Delivery Partner",
    website: "https://example.com",
    status: "active",
    created_by: recruiter.user.id,
  };
  const vendorInsert = await recruiter.client
    .from("vendors")
    .insert(vendorPayload)
    .select(
      "id, name, contact_name, contact_email, contact_phone, linkedin_id, contact_role, website, status",
    )
    .single();
  assert.ifError(vendorInsert.error);
  assert.ok(vendorInsert.data?.id, "Vendor insert did not return an id");
  created.vendorIds.push(vendorInsert.data.id);
  const { id: vendorId, ...vendorFields } = vendorInsert.data;
  assert.deepEqual(vendorFields, {
    name: vendorPayload.name,
    contact_name: vendorPayload.contact_name,
    contact_email: vendorPayload.contact_email,
    contact_phone: vendorPayload.contact_phone,
    linkedin_id: vendorPayload.linkedin_id,
    contact_role: vendorPayload.contact_role,
    website: vendorPayload.website,
    status: vendorPayload.status,
  });
  results.vendor = "created and verified";

  const candidatePayload = {
    first_name: "E2E",
    last_name: `Candidate-${runId}`,
    email: `candidate-${runId}@example.com`,
    current_title: "Senior TypeScript Engineer",
    required_job: "Staff Engineer",
    ready_to_relocate: false,
    preferred_location: "Bengaluru",
    primary_technology: "TypeScript",
    currency: "USD",
    status: "active",
    source: "manual",
  };
  const candidateInsert = await recruiter.client.rpc("create_candidate_graph", {
    _candidate: candidatePayload,
    _skills: [{ skill: "TypeScript", years: 5, is_primary: true }],
    _employment: [],
    _education: [],
    _projects: [],
    _certifications: [],
    _resume: null,
  });
  assert.ifError(candidateInsert.error);
  const candidateId = candidateInsert.data?.[0]?.candidate_id;
  assert.ok(candidateId, "Candidate RPC did not return an id");
  created.candidateIds.push(candidateId);

  const candidateRead = await recruiter.client
    .from("candidates")
    .select(
      "id, current_title, required_job, ready_to_relocate, preferred_location, primary_technology",
    )
    .eq("id", candidateId)
    .single();
  assert.ifError(candidateRead.error);
  assert.deepEqual(candidateRead.data, {
    id: candidateId,
    current_title: candidatePayload.current_title,
    required_job: candidatePayload.required_job,
    ready_to_relocate: false,
    preferred_location: candidatePayload.preferred_location,
    primary_technology: candidatePayload.primary_technology,
  });
  results.candidate = "created and verified";

  const invalidCandidate = await recruiter.client.rpc("create_candidate_graph", {
    _candidate: {
      first_name: "E2E",
      last_name: `Invalid-${runId}`,
      ready_to_relocate: false,
      preferred_location: "",
    },
    _skills: [],
    _employment: [],
    _education: [],
    _projects: [],
    _certifications: [],
    _resume: null,
  });
  assert.ok(invalidCandidate.error, "Candidate relocation invariant was not enforced");
  results.candidateValidation = "rejected missing preferred location";

  const developerCandidate = await developer.client.rpc("create_candidate_graph", {
    _candidate: {
      first_name: "E2E",
      last_name: `Unauthorized-${runId}`,
      ready_to_relocate: true,
    },
    _skills: [],
    _employment: [],
    _education: [],
    _projects: [],
    _certifications: [],
    _resume: null,
  });
  if (developerCandidate.data?.[0]?.candidate_id) {
    created.candidateIds.push(developerCandidate.data[0].candidate_id);
  }
  assert.ok(developerCandidate.error, "Developer-only account created a candidate through the RPC");

  const developerCandidates = await developer.client
    .from("candidates")
    .select("id")
    .eq("id", candidateId);
  assert.ifError(developerCandidates.error);
  assert.deepEqual(developerCandidates.data, [], "Developer-only account read candidate data");

  const developerVendors = await developer.client.from("vendors").select("id").eq("id", vendorId);
  assert.ifError(developerVendors.error);
  assert.deepEqual(developerVendors.data, [], "Developer-only account read vendor data");
  results.roleIsolation = "developer-only account blocked";

  const avatarPath = `${administrator.user.id}/avatar`;
  const avatarList = await administrator.client.storage
    .from("profile-avatars")
    .list(administrator.user.id, { search: "avatar", limit: 10 });
  assert.ifError(avatarList.error);
  const existingAvatar = (avatarList.data ?? []).some((entry) => entry.name === "avatar");

  if (existingAvatar) {
    const existingDownload = await administrator.client.storage
      .from("profile-avatars")
      .download(avatarPath);
    assert.ifError(existingDownload.error);
    assert.ok(existingDownload.data.size > 0, "Existing profile avatar is empty");
    results.avatar = "existing avatar downloaded and verified";
  } else {
    const png = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const upload = await administrator.client.storage
      .from("profile-avatars")
      .upload(avatarPath, png, { contentType: "image/png", upsert: false });
    assert.ifError(upload.error);
    created.avatarPath = avatarPath;

    const download = await administrator.client.storage
      .from("profile-avatars")
      .download(avatarPath);
    assert.ifError(download.error);
    assert.ok(download.data.size > 0, "Uploaded profile avatar is empty");
    results.avatar = "uploaded and downloaded";
  }
} finally {
  if (created.avatarPath) {
    const removal = await administrator.client.storage
      .from("profile-avatars")
      .remove([created.avatarPath]);
    assert.ifError(removal.error);
  }
  if (created.candidateIds.length) {
    const removal = await administrator.client
      .from("candidates")
      .delete()
      .in("id", created.candidateIds)
      .select("id");
    assert.ifError(removal.error);
    assert.equal(
      removal.data?.length,
      created.candidateIds.length,
      "Candidate cleanup was incomplete",
    );
  }
  if (created.vendorIds.length) {
    const removal = await administrator.client
      .from("vendors")
      .delete()
      .in("id", created.vendorIds)
      .select("id");
    assert.ifError(removal.error);
    assert.equal(removal.data?.length, created.vendorIds.length, "Vendor cleanup was incomplete");
  }
  await Promise.all([
    recruiter.client.auth.signOut({ scope: "local" }),
    developer.client.auth.signOut({ scope: "local" }),
    administrator.client.auth.signOut({ scope: "local" }),
  ]);
}

console.log(JSON.stringify({ status: "passed", results }, null, 2));
