import { readFile } from "node:fs/promises";

const [start, server] = await Promise.all([
  readFile(new URL("../src/start.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/server.ts", import.meta.url), "utf8"),
]);

const failures = [];
if (!/requestMiddleware:\s*\[[\s\S]*payloadLimitMiddleware/.test(start)) {
  failures.push("payloadLimitMiddleware is not globally registered");
}
if (!/assertRequestBodyWithinLimit\(request\)/.test(start)) {
  failures.push("streamed request bodies are not measured");
}
if (!/assertDeclaredRequestBodyWithinLimit\(request\)/.test(server)) {
  failures.push("the raw server entry does not reject oversized declared bodies before routing");
}
if (!/status:\s*413/.test(server)) failures.push("the raw server entry does not return HTTP 413");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Global request body limit wiring check passed.");
}
