// Real-Redis integration check for src/lib/cache.server.ts.
// Usage: npm run redis:up && REDIS_URL=redis://127.0.0.1:6379 npm run test:cache:integration
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

for (const path of [".env.local", ".env"]) {
  if (existsSync(path)) process.loadEnvFile(path);
}
assert.ok(process.env.REDIS_URL, "REDIS_URL is required for the Redis integration check");

const { cached, getCacheStats, invalidateTenantCache } = await import("../src/lib/cache.server.ts");

const scope = {
  tenantId: `smoke-${randomUUID()}`,
  userId: randomUUID(),
  name: "smoke:value",
  ttlSeconds: 2,
};
let loads = 0;
const load = async () => ({ loads: ++loads });

// The client connects in the background; wait until a read is actually cached.
const deadline = Date.now() + 5_000;
while (getCacheStats().misses === 0) {
  assert.ok(Date.now() < deadline, "Redis did not become ready within 5 seconds");
  await cached(scope, load);
  await new Promise((resolve) => setTimeout(resolve, 100));
}
const loadsAfterMiss = loads;

const start = performance.now();
assert.deepEqual(await cached(scope, load), { loads: loadsAfterMiss }, "expected a cache hit");
const hitMs = performance.now() - start;
assert.equal(loads, loadsAfterMiss, "a hit must not run the loader");

assert.deepEqual(
  await cached({ ...scope, userId: randomUUID() }, async () => "other user"),
  "other user",
  "another user must not receive this user's entry",
);

await invalidateTenantCache(scope.tenantId);
assert.deepEqual(await cached(scope, load), { loads: loadsAfterMiss + 1 }, "expected a reload");

await new Promise((resolve) => setTimeout(resolve, 2_300));
assert.deepEqual(await cached(scope, load), { loads: loadsAfterMiss + 2 }, "expected TTL expiry");

console.info(
  JSON.stringify({ redis: "ok", hit_ms: Math.round(hitMs * 100) / 100, ...getCacheStats() }),
);
process.exit(0);
