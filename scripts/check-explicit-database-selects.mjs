import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const roots = ["src", "workers"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);

function walk(path) {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((entry) => walk(join(path, entry)));
}

const productionFiles = roots
  .flatMap(walk)
  .map((file) => relative(".", file).replaceAll("\\", "/"))
  .filter(
    (file) =>
      extensions.has(extname(file)) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) &&
      !file.includes("/__tests__/"),
  );

const forbidden = [
  [/\.select\(\s*(["'`])\s*\*\s*\1/g, "wildcard select"],
  [/\.select\(\s*(["'`])\s*\*,/g, "wildcard select with embedded relationships"],
  [/\.select\(\s*\)/g, "implicit wildcard select"],
];

const failures = [];
for (const file of productionFiles) {
  const source = readFileSync(file, "utf8");
  for (const [pattern, label] of forbidden) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) failures.push(`${file}: ${label}`);
  }
}

if (failures.length) {
  console.error(
    "Explicit database projection check failed. Select only the DTO fields required by the caller:\n" +
      failures.join("\n"),
  );
  process.exit(1);
}

console.log(`Explicit database projection check passed (${productionFiles.length} files scanned).`);
