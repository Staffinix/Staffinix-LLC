import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const checks = [
  ["src/lib/candidates.functions.ts", "listCandidates", /\.range\(/],
  ["src/lib/clients.functions.ts", "listClients", /\.range\(/],
  ["src/lib/clients.functions.ts", "listClientsLite", /\.limit\(200\)/],
  ["src/lib/requirements.functions.ts", "listRequirements", /\.range\(/],
  ["src/lib/access-requests.functions.ts", "getMyAccessRequest", /\.limit\(100\)/],
  ["src/lib/access-requests.functions.ts", "listAccessRequests", /\.limit\(100\)/],
  ["src/lib/users.functions.ts", "listUsers", /\.limit\(100\)/],
  ["src/lib/dashboard.functions.ts", "getRecentActivity", /\.limit\(15\)/],
  ["src/lib/candidates.functions.ts", "getCandidate", /\.limit\(50\)[\s\S]*\.limit\(100\)/],
  ["src/lib/candidates.functions.ts", "semanticSearchCandidates", /\.limit\(data\.limit\)/],
];

const cache = new Map();

for (const [path, functionName, boundPattern] of checks) {
  const source = cache.get(path) ?? (await readFile(path, "utf8"));
  cache.set(path, source);
  const start = source.indexOf(`export const ${functionName}`);
  assert.notEqual(start, -1, `${functionName} is missing from ${path}`);
  const nextExport = source.indexOf("export const ", start + 13);
  const body = source.slice(start, nextExport === -1 ? source.length : nextExport);
  assert.match(body, boundPattern, `${functionName} must enforce a server-side result bound`);
}

const allServerSources = [...cache.values()].join("\n");
assert.doesNotMatch(
  allServerSources,
  /\.from\(["']notifications["']\)/,
  "A notifications endpoint exists but is not included in the bounded endpoint audit",
);

const dashboardSource = cache.get("src/lib/dashboard.functions.ts");
assert.match(
  dashboardSource,
  /export const getDashboardOverview[\s\S]*\.rpc\("dashboard_overview"\)/,
  "dashboard collections must be returned by the bounded dashboard_overview aggregate RPC",
);
assert.match(
  dashboardSource,
  /recruiters:[\s\S]*\.max\(5\)/,
  "dashboard recruiter output must have a schema-enforced bound",
);
assert.match(
  dashboardSource,
  /top_tech:[^\n]*\.max\(8\)/,
  "dashboard technology output must have a schema-enforced bound",
);

console.log(
  `Verified server-side bounds for ${checks.length} collection endpoints and the dashboard aggregate.`,
);
