import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const WRITE_PATTERN =
  /\.(insert|update|upsert|delete|remove|upload|move|copy)\(|\.rpc\(|supabaseAdmin|writeAudit|import\(|fetch\(/;

test("server functions marked read-only contain no writes", () => {
  const marked: string[] = [];
  const files = [
    ...readdirSync("src/lib").map((name) => `src/lib/${name}`),
    "src/features/ai-matching/matching.functions.ts",
  ].filter((file) => file.endsWith(".functions.ts"));

  for (const file of files) {
    const blocks = readFileSync(file, "utf8").split(/(?=^export const \w+ = createServerFn)/m);
    for (const block of blocks) {
      if (!/\.middleware\(\[[^\]]*readOnlyServerFn/.test(block)) continue;
      const name = /^export const (\w+)/.exec(block)?.[1] ?? file;
      // Stop at the next top-level declaration so helpers below are not attributed to it.
      const body = block.split(/\r?\n(?:const|function|async function|type|interface) /)[0];
      marked.push(name);
      assert.doesNotMatch(body, WRITE_PATTERN, `${name} is marked read-only but appears to write`);
    }
  }
  assert.ok(marked.length >= 17, `expected the read-only list functions, found ${marked.length}`);
});
