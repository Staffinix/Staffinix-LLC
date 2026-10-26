import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = fileURLToPath(new URL("../.env.local", import.meta.url));
if (execFileSync("git", ["ls-files", "--", ".env.local"], { cwd: root, encoding: "utf8" }).trim()) {
  throw new Error("Refusing to write secrets into a tracked env file.");
}
if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
  throw new Error("Refusing to follow an env-file symlink.");
}
let source = existsSync(target) ? readFileSync(target, "utf8") : "";
const existing = source.match(/^DOCUMENT_PROCESSOR_TOKEN=(.*)$/m)?.[1]?.trim();
const token =
  existing && /^[a-zA-Z0-9_-]{32,}$/.test(existing) ? existing : randomBytes(32).toString("hex");
for (const [key, value] of Object.entries({
  DOCUMENT_PROCESSOR_URL: "http://127.0.0.1:8788",
  DOCUMENT_PROCESSOR_TOKEN: token,
})) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  source = pattern.test(source)
    ? source.replace(pattern, () => `${key}=${value}`)
    : `${source.trimEnd()}\n${key}=${value}\n`;
}
writeFileSync(target, source, { mode: 0o600 });
console.log(
  "Local document endpoint and private token configured in ignored .env.local. No secrets printed.",
);
