import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

function listFiles(directory, extensions) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(path, extensions);
    return extensions.has(extname(entry.name)) ? [path] : [];
  });
}

const sourceFiles = listFiles("src", new Set([".ts", ".tsx"])).filter(
  (path) => !path.endsWith(".test.ts"),
);
const migrationFiles = listFiles("supabase/migrations", new Set([".sql"]));
const approvedIdentityMigrationSuffixes = new Set([
  "20260902045517_provision_initial_role_hierarchy.sql",
  "20260923133013_restore_launch_account_roles.sql",
]);

const forbiddenMarkers = [
  ["MENTOR", "_ACCOUNTS"].join(""),
  ["get", "Demo", "UserForEmail"].join(""),
  ["staffinix", "_active_user"].join(""),
  ["user", "-custom-"].join(""),
  ["auth", "-helpers"].join(""),
  ["setActive", "DemoUser"].join(""),
  ["getActive", "DemoUser"].join(""),
  ["clearActive", "DemoUser"].join(""),
  ["auth", "Service"].join(""),
  "usr-default",
];

const forbiddenIdentityPatterns = [
  [/(?:manideep(?:\.staffinix|staff)?|manistaff)@gmail\.com/i, "legacy demo email"],
  [/staffinix\s*@\s*2026/i, "legacy demo password"],
  [/Manideep\s*\(Recruiter\)/i, "constructed demo profile"],
];

const violations = [];
for (const file of sourceFiles) {
  const source = readFileSync(file, "utf8");
  for (const marker of forbiddenMarkers) {
    if (source.includes(marker)) violations.push(`${file}: prohibited marker ${marker}`);
  }
  for (const [pattern, label] of forbiddenIdentityPatterns) {
    if (pattern.test(source)) violations.push(`${file}: ${label}`);
  }
}

for (const file of migrationFiles) {
  const source = readFileSync(file, "utf8");
  for (const [pattern, label] of forbiddenIdentityPatterns) {
    // This one server-side data migration intentionally resolves the four
    // user-approved launch accounts by email. It contains no password and is
    // never bundled. Continue scanning it for credential/password markers.
    if (
      label === "legacy demo email" &&
      [...approvedIdentityMigrationSuffixes].some((suffix) => file.endsWith(suffix))
    ) {
      continue;
    }
    if (pattern.test(source)) violations.push(`${file}: ${label}`);
  }
}

assert.equal(
  existsSync("src/lib/auth-service.ts"),
  false,
  "Application-managed AuthService must not be reintroduced",
);

const authRoute = readFileSync("src/routes/auth.tsx", "utf8");
assert.equal(
  authRoute.match(/\.auth\.signInWithPassword\(/g)?.length,
  1,
  "The login page must have exactly one Supabase password sign-in path",
);
assert.equal(
  authRoute.match(/\.auth\.signInWithOAuth\(/g)?.length,
  1,
  "OAuth must go directly through Supabase Auth",
);
assert.doesNotMatch(authRoute, /integrations\/lovable/, "OAuth must not use another auth broker");

const signInStart = authRoute.indexOf("async function handleSignIn");
const signInEnd = authRoute.indexOf("\n  return (", signInStart);
assert.notEqual(signInStart, -1, "Password sign-in handler is missing");
assert.notEqual(signInEnd, -1, "Password sign-in handler boundary is missing");
const signInHandler = authRoute.slice(signInStart, signInEnd);
assert.match(signInHandler, /\.auth\.signInWithPassword\(/);
assert.doesNotMatch(signInHandler, /\.auth\.signUp\(/, "Login must never create an account");
assert.doesNotMatch(
  signInHandler,
  /localStorage|sessionStorage|roleLevel|tenantId|isPlatformStaff/,
  "Login must not consult local identity state or assign authorization",
);

const profileHook = readFileSync("src/hooks/use-profile.ts", "utf8");
assert.match(
  profileHook,
  /useServerFn\(getMyProfile\)/,
  "Profile and roles must come from the authenticated backend",
);
assert.doesNotMatch(
  profileHook,
  /gmail\.com|usr-default|roles:\s*\[|level:\s*["']/,
  "Profile hook must not construct identity or role defaults",
);

const sessionHook = readFileSync("src/hooks/use-session.ts", "utf8");
assert.match(sessionHook, /supabase\.auth\.getUser\(\)/, "UI auth state must be Supabase-verified");
assert.doesNotMatch(
  sessionHook,
  /session:\s*\{\s*user:/,
  "Session hook must not manufacture a session object",
);

const profileServer = readFileSync("src/lib/profile.functions.ts", "utf8");
assert.match(
  profileServer,
  /getMyProfile[\s\S]*?middleware\(\[\s*serverFunctionAuth\s*,\s*requireSupabaseAuth\s*\]\)/,
  "Profile endpoint must require verified server-function and Supabase JWT authentication",
);
assert.doesNotMatch(
  profileServer,
  /role_level|effectiveRoles|resolvedLevel\s*===/,
  "Profile endpoints must not accept or manufacture authorization",
);

const roleLevelHook = readFileSync("src/hooks/use-role-level.ts", "utf8");
assert.doesNotMatch(
  roleLevelHook,
  /localStorage|sessionStorage|setLevel|useState|\|\|\s*["']L4["']|\?\?\s*["']L4["']/,
  "The role-level hook must be a read-only view of server-owned authorization",
);

const authAttacher = readFileSync("src/integrations/supabase/auth-attacher.ts", "utf8");
assert.doesNotMatch(
  authAttacher,
  /window\.localStorage|window\.sessionStorage/,
  "Bearer transport must use the Supabase client session API, not parse browser storage",
);

const platformAuth = readFileSync("src/lib/platform-auth.server.ts", "utf8");
assert.doesNotMatch(
  platformAuth,
  /role_level|from\(["']user_roles["']\)|return\s+Boolean\(profile\.is_active\)/,
  "Platform authorization must come only from platform_admins membership",
);

const tenancySource = readFileSync("src/lib/tenancy.functions.ts", "utf8");
for (const unsafeDefault of ['platformRole: "platform_owner"', "isPlatformStaff: true"]) {
  if (tenancySource.includes(unsafeDefault)) {
    violations.push(`src/lib/tenancy.functions.ts: privileged default ${unsafeDefault}`);
  }
}

assert.deepEqual(
  violations,
  [],
  `Production authentication bypass markers found:\n${violations.join("\n")}`,
);

if (process.argv.includes("--bundle")) {
  assert.ok(existsSync(".output/public"), "Build output is missing; run npm run build first");
  const bundle = listFiles(".output/public", new Set([".js", ".mjs"]))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  for (const [pattern, label] of forbiddenIdentityPatterns) {
    assert.doesNotMatch(bundle, pattern, `Client bundle contains ${label}`);
  }
  for (const marker of forbiddenMarkers) {
    assert.equal(bundle.includes(marker), false, `Client bundle contains prohibited ${marker}`);
  }

  console.log("Authentication bypass and credential bundle scan passed.");
} else {
  console.log(`Authentication bypass scan passed (${sourceFiles.length} production source files).`);
}
