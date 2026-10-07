import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function listTypeScript(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScript(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const violations = [];
let serverFunctionCount = 0;
const intentionallyPublicFunctions = new Set(["src/lib/contact-us.functions.ts:submitContactUs"]);
const authMiddlewareSource = readFileSync("src/integrations/supabase/auth-middleware.ts", "utf8");
const profileFunctionsSource = readFileSync("src/lib/profile.functions.ts", "utf8");
const authenticatedMiddlewareNames = new Set([
  "requireSupabaseAuth",
  ...[
    ...authMiddlewareSource.matchAll(/export const (require\w+Access) = requireFeatureAccess\(/g),
  ].map((match) => match[1]),
]);

if (
  !/requireFeatureAccess[\s\S]*?\.middleware\(\[requireSupabaseAuth\]\)/.test(authMiddlewareSource)
) {
  violations.push("Feature access middleware is not composed with Supabase authentication");
}

for (const file of listTypeScript("src")) {
  const source = readFileSync(file, "utf8");
  const starts = [...source.matchAll(/export const (\w+) = createServerFn\(/g)];
  for (let index = 0; index < starts.length; index += 1) {
    serverFunctionCount += 1;
    const start = starts[index];
    const functionId = `${file.replaceAll("\\", "/")}:${start[1]}`;
    const end = starts[index + 1]?.index ?? source.length;
    const block = source.slice(start.index, end);
    const middlewareNames = [...block.matchAll(/\.middleware\(\[([^\]]*)\]\)/gs)].flatMap(
      (match) => match[1].match(/\brequire\w+\b/g) ?? [],
    );
    if (
      !intentionallyPublicFunctions.has(functionId) &&
      !middlewareNames.some((name) => authenticatedMiddlewareNames.has(name))
    ) {
      violations.push(`${functionId} has no Supabase authentication middleware`);
    }
  }
}

const privilegedGuards = {
  "src/lib/users.functions.ts": {
    listUsers: "requireAdminContext(context)",
    inviteUser: "requireAdminContext(context)",
    updateUserRole: "assertCanManageUser",
    setUserActive: "assertCanManageUser",
  },
  "src/lib/tenancy.functions.ts": {
    listTenants: "requirePlatformAdmin",
    createTenant: "requirePlatformAdmin",
    updateTenant: "requirePlatformAdmin",
    getCompanyOverview: "requireAdmin",
    updateMyCompany: "requireAdmin",
  },
  "src/lib/access-requests.functions.ts": {
    listAccessRequests: "requirePlatformAdmin",
    reviewAccessRequest: "requirePlatformAdmin",
  },
  "src/lib/developer.functions.ts": {
    getDeveloperConfig: "requireAdmin(context)",
    createApiKey: "requireAdmin(context)",
    revokeApiKey: "requireAdmin(context)",
    updateWorkflowSettings: "requireAdmin(context)",
  },
};

for (const [file, guards] of Object.entries(privilegedGuards)) {
  const source = readFileSync(file, "utf8");
  const starts = [...source.matchAll(/export const (\w+) = createServerFn\(/g)];
  for (let index = 0; index < starts.length; index += 1) {
    const name = starts[index][1];
    const guard = guards[name];
    if (!guard) continue;
    const end = starts[index + 1]?.index ?? source.length;
    const block = source.slice(starts[index].index, end);
    if (!block.includes(guard)) violations.push(`${file}:${name} is missing ${guard}`);
  }
}

const selectsActiveProfile = /\.select\("[^"]*\bis_active\b[^"]*"\)/.test(authMiddlewareSource);
const deniesInactiveProfile = authMiddlewareSource.includes("profile?.is_active !== true");
if (!selectsActiveProfile || !deniesInactiveProfile) {
  violations.push("Authentication middleware does not enforce active profiles");
}

if (
  !/getMyProfile[\s\S]*?\.middleware\(\[serverFunctionAuth,\s*requireSupabaseAuth\]\)/.test(
    profileFunctionsSource,
  )
) {
  violations.push("Profile bootstrap must attach the browser session before server authentication");
}

assert.deepEqual(violations, [], `Server authorization violations:\n${violations.join("\n")}`);

const contactUsSource = readFileSync("src/lib/contact-us.functions.ts", "utf8");
assert.match(
  contactUsSource,
  /ContactUsSchema/,
  "Contact form input must be validated on the server",
);
assert.match(contactUsSource, /website/, "Contact form must retain its honeypot check");
assert.match(
  contactUsSource,
  /\.from\("contact_us"\)\.insert\(/,
  "Contact form must insert into the contact_us table",
);
console.log(`Server authorization scan passed (${serverFunctionCount} server functions).`);
