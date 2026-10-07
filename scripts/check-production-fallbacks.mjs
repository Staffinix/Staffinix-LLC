import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const sourceRoots = ["src/routes/_authenticated", "src/components", "src/hooks", "src/lib"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const fixtureFiles = new Set([
  "src/lib/master-mock-dataset.ts",
  "src/lib/tailoring-mock.ts",
  "src/lib/production-fixtures-disabled.ts",
]);

function walk(path) {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((entry) => walk(join(path, entry)));
}

const productionFiles = sourceRoots
  .flatMap(walk)
  .map((file) => relative(".", file).replaceAll("\\", "/"))
  .filter((file) => sourceExtensions.has(extname(file)) && !fixtureFiles.has(file));

const forbidden = [
  [
    /(?:master-mock-dataset|tailoring-mock|pipeline-store|tenant-store|resume-data)/i,
    "development fixture or in-memory business-data import",
  ],
  [/\bMASTER_[A-Z0-9_]+\b/, "master fixture reference"],
  [/\b(?:MOCK|FAKE)_[A-Z0-9_]+\b/, "mock business-data constant"],
  [/\bINITIAL_SUBMISSIONS\b/, "seeded submission data"],
  [/catch\s*\([^)]*\)\s*\{\s*\}/s, "empty catch block"],
  [/fallback[^\n]*(mock|demo|fake)|(?:mock|demo|fake)[^\n]*fallback/i, "mock fallback"],
  [
    /\b(?:stats|metrics)\??\.\w+\s*>\s*0\s*\?[^:]+:\s*(?:MASTER_|MOCK_|FAKE_)/s,
    "positive-only metric fallback",
  ],
  [
    /(?:skills?|technology)\s*(?:\?\?|\|\|)\s*\[?\s*["']Software["']/i,
    "invented generic skill fallback",
  ],
];

const failures = [];
for (const file of productionFiles) {
  const source = readFileSync(file, "utf8");
  for (const [pattern, label] of forbidden) {
    if (pattern.test(source)) failures.push(`${file}: ${label}`);
  }
}

const viteConfig = readFileSync("vite.config.ts", "utf8");
const disabledFixture = readFileSync("src/lib/production-fixtures-disabled.ts", "utf8");
for (const fixtureImport of ["@/lib/master-mock-dataset", "@/lib/tailoring-mock"]) {
  if (!viteConfig.includes(fixtureImport)) {
    failures.push(`vite.config.ts: missing production alias for ${fixtureImport}`);
  }
}
if (!/throw new Error/.test(disabledFixture)) {
  failures.push("production fixture replacement does not fail closed");
}

if (failures.length) {
  console.error("Production mock/fallback security check failed:\n" + failures.join("\n"));
  process.exit(1);
}

console.log(
  `Production mock/fallback security check passed (${productionFiles.length} files scanned).`,
);
