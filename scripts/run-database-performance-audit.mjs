import { spawnSync } from "node:child_process";

const required = ["DATABASE_URL", "AUDIT_TENANT_ID", "AUDIT_USER_ID"];
const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const result = spawnSync(
  "psql",
  [
    process.env.DATABASE_URL,
    "--no-psqlrc",
    "--set=ON_ERROR_STOP=1",
    `--set=audit_tenant_id=${process.env.AUDIT_TENANT_ID}`,
    `--set=audit_user_id=${process.env.AUDIT_USER_ID}`,
    "--file=supabase/tests/performance/query_plans.sql",
  ],
  { stdio: "inherit", env: process.env },
);

if (result.error?.code === "ENOENT") {
  console.error("psql is required to run the database performance audit.");
  process.exit(1);
}

process.exit(result.status ?? 1);
