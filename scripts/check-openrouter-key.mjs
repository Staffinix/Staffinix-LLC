// Checks the OpenRouter key this app would use, without ever printing it.
// Usage: put OPENROUTER_API_KEY in .env (or the shell), then: npm run check:openrouter
import { existsSync } from "node:fs";

for (const path of [".env.local", ".env"]) {
  if (existsSync(path)) process.loadEnvFile(path);
}

const raw = process.env.OPENROUTER_API_KEY ?? "";
const key = raw.trim();
const chatModel = process.env.OPENROUTER_CHAT_MODEL?.trim();
// The same choices the app makes: matching, then every other chat feature.
const models = [
  ...new Set([
    process.env.OPENROUTER_MATCH_MODEL?.trim() || chatModel || "openai/gpt-4o-mini",
    chatModel || "google/gemini-3-flash-preview",
  ]),
];

if (!key) {
  console.error("FAIL: OPENROUTER_API_KEY is empty. The app reports: AI Gateway is not configured");
  process.exit(1);
}

// Shape problems that make a correct key fail once pasted into a dashboard.
const shape = [];
if (raw !== key) shape.push("has leading or trailing whitespace (the app trims this)");
if (/^["'`]|["'`]$/.test(key)) shape.push("is wrapped in quotes - remove them");
if (/\s/.test(key)) shape.push("contains a space or line break");
if (/^Bearer\s/i.test(key)) shape.push('starts with "Bearer " - store the key only');
if (!key.startsWith("sk-or-")) shape.push('does not start with "sk-or-"');
console.log(
  `Key shape: ${shape.length ? "PROBLEM - " + shape.join("; ") : "ok"} (length ${key.length})`,
);

const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };

const status = await fetch("https://openrouter.ai/api/v1/key", { headers });
if (!status.ok) {
  console.error(`FAIL: OpenRouter rejected the key (HTTP ${status.status}). It is wrong, revoked,`);
  console.error("or not an inference key. The app reports: AI request failed (401)");
  process.exit(1);
}
const { data } = await status.json();
console.log(
  `Key accepted. Spending limit: ${data.limit ?? "none"} | remaining: ${data.limit_remaining ?? "n/a"}` +
    ` | used: ${data.usage} | free tier: ${data.is_free_tier}`,
);

let failed = false;
for (const model of models) {
  const completion = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 5,
      messages: [{ role: "user", content: "Reply OK" }],
    }),
  });
  if (completion.ok) {
    console.log(`PASS: a test request to ${model} succeeded.`);
    continue;
  }
  failed = true;
  const hint =
    completion.status === 402
      ? "no credits or the key's spending limit is reached"
      : completion.status === 429
        ? "rate limited"
        : "see status";
  console.error(`FAIL: test request to ${model} returned HTTP ${completion.status} (${hint}).`);
}
process.exit(failed ? 1 : 0);
