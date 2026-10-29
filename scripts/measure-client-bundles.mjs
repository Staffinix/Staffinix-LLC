import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const imports = (source) =>
  [...source.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)].map((match) => match[1]);
assert.deepEqual(imports('import "./a.js"; import { x } from "./b.js"; import("./lazy.js")'), [
  "a.js",
  "b.js",
]);
const directory = process.argv[2] || ".vercel/output/static/assets";
const files = readdirSync(directory);
const sizes = new Map(
  files
    .filter((file) => /\.(js|css)$/.test(file))
    .map((file) => [file, gzipSync(readFileSync(join(directory, file)), { mtime: 0 }).length]),
);
function closure(file, seen = new Set()) {
  if (seen.has(file) || !sizes.has(file)) return seen;
  seen.add(file);
  for (const dependency of imports(readFileSync(join(directory, file), "utf8")))
    closure(dependency, seen);
  return seen;
}
const js = [...sizes].filter(([file]) => file.endsWith(".js"));
const routes = {};
for (const prefix of [
  "client-",
  "candidates._id-",
  "candidates.index-",
  "tailoring-",
  "dashboard-",
  "matching-",
  "requirements.new-",
  "vendors.index-",
]) {
  const file = files.find((name) => name.startsWith(prefix) && name.endsWith(".js"));
  if (file) {
    const dependencies = [...closure(file)];
    routes[prefix] = {
      files: dependencies.length,
      gzip_bytes: dependencies.reduce((sum, name) => sum + sizes.get(name), 0),
    };
  }
}
console.log(
  JSON.stringify(
    {
      note: "Build artifact gzip sizes; static import closures exclude dynamic chunks and are not browser transfer or CWV measurements.",
      js_files: js.length,
      js_gzip_bytes: js.reduce((sum, [, size]) => sum + size, 0),
      css_gzip_bytes: [...sizes]
        .filter(([file]) => file.endsWith(".css"))
        .reduce((sum, [, size]) => sum + size, 0),
      largest_js: js.sort((a, b) => b[1] - a[1]).slice(0, 8),
      routes,
    },
    null,
    2,
  ),
);
