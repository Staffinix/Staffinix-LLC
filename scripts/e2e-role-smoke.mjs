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

const accounts = [
  {
    level: "L1",
    email: "manideep.staffinix@gmail.com",
    roles: ["super_admin"],
    platformRole: "platform_owner",
  },
  {
    level: "L2",
    email: "manideep@gmail.com",
    roles: ["super_admin"],
    platformRole: null,
  },
  {
    level: "L3",
    email: "manistaff@gmail.com",
    roles: ["developer_admin"],
    platformRole: null,
  },
  {
    level: "L4",
    email: "manideepstaff@gmail.com",
    roles: ["recruiter"],
    platformRole: null,
  },
];

const results = [];

for (const expected of accounts) {
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
    email: expected.email,
    password,
  });
  assert.ifError(signInError);
  assert.ok(signIn.user, `${expected.level} did not return an authenticated user`);

  const { data: verified, error: userError } = await client.auth.getUser();
  assert.ifError(userError);
  assert.equal(verified.user?.id, signIn.user.id, `${expected.level} session user mismatch`);

  const [profileResult, rolesResult, platformResult] = await Promise.all([
    client
      .from("profiles")
      .select("id, tenant_id, email, is_active")
      .eq("id", signIn.user.id)
      .single(),
    client.from("user_roles").select("role").eq("user_id", signIn.user.id),
    client.from("platform_admins").select("role").eq("user_id", signIn.user.id).maybeSingle(),
  ]);

  assert.ifError(profileResult.error);
  assert.ifError(rolesResult.error);
  assert.ifError(platformResult.error);
  assert.equal(profileResult.data.is_active, true, `${expected.level} profile is inactive`);
  assert.equal(
    profileResult.data.email,
    expected.email,
    `${expected.level} profile email mismatch`,
  );

  const actualRoles = (rolesResult.data ?? []).map(({ role }) => role).sort();
  assert.deepEqual(actualRoles, [...expected.roles].sort(), `${expected.level} role mismatch`);
  assert.equal(
    platformResult.data?.role ?? null,
    expected.platformRole,
    `${expected.level} platform role mismatch`,
  );

  const { data: platformOverview, error: platformRpcError } = await client.rpc(
    "platform_console_overview",
  );
  if (expected.platformRole === "platform_owner") {
    assert.ifError(platformRpcError);
    assert.ok(
      Number(platformOverview?.totals?.tenants) > 0,
      `${expected.level} did not receive platform tenant totals`,
    );
  } else {
    assert.equal(
      platformOverview?.totals?.tenants ?? 0,
      0,
      `${expected.level} received restricted platform totals`,
    );
    assert.deepEqual(
      platformOverview?.tenants ?? [],
      [],
      `${expected.level} received restricted platform tenant rows`,
    );
  }

  results.push({
    level: expected.level,
    authenticated: true,
    active: true,
    tenantAssigned: Boolean(profileResult.data.tenant_id),
    roles: actualRoles,
    platformRole: platformResult.data?.role ?? null,
    platformTenantRows: platformOverview?.tenants?.length ?? 0,
  });

  await client.auth.signOut({ scope: "local" });
}

console.log(JSON.stringify({ status: "passed", accounts: results }, null, 2));
