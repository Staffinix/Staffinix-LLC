import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const serverFunctions = readFileSync(resolve(root, "src/lib/dashboard.functions.ts"), "utf8");
const dashboardRoute = readFileSync(
  resolve(root, "src/routes/_authenticated/dashboard.tsx"),
  "utf8",
);
const migration = readFileSync(
  resolve(root, "supabase/migrations/20260824111250_dashboard_aggregate_rpc.sql"),
  "utf8",
);

assert.match(
  serverFunctions,
  /rpc\("dashboard_overview"\)/,
  "dashboard must use one aggregate RPC",
);
for (const forbidden of [
  'from("submissions")',
  'from("candidates")',
  "MAX_DASHBOARD_DETAIL_ROWS",
  "getSubmissionsTrend",
  "getTopRecruiters",
  "getBenchStats",
]) {
  assert.equal(
    serverFunctions.includes(forbidden),
    false,
    `dashboard server function still performs application-side aggregation: ${forbidden}`,
  );
}

assert.match(dashboardRoute, /getDashboardOverview/, "dashboard route must load the overview RPC");
for (const legacyCall of [
  "getDashboardStats",
  "getSubmissionsTrend",
  "getPipelineFunnel",
  "getRequirementsBreakdown",
  "getTopRecruiters",
]) {
  assert.equal(
    dashboardRoute.includes(legacyCall),
    false,
    `dashboard route still issues legacy request: ${legacyCall}`,
  );
}

assert.match(migration, /SECURITY INVOKER/, "dashboard RPC must preserve caller RLS");
assert.equal(migration.includes("SECURITY DEFINER"), false, "dashboard RPC must not bypass RLS");
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.dashboard_overview\(\) FROM PUBLIC, anon/,
  "dashboard RPC must deny public and anonymous execution",
);
assert.match(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.dashboard_overview\(\) TO authenticated/,
  "dashboard RPC must grant only authenticated application callers",
);
assert.match(migration, /submissions_dashboard_submitted_idx/, "recent aggregates need an index");
assert.match(migration, /candidates_dashboard_bench_idx/, "bench aggregates need an index");

console.log("Dashboard aggregation boundary checks passed.");
