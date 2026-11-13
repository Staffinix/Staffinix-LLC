import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  cached,
  getCacheStats,
  invalidateTenantCache,
  isAllowedRedisUrl,
  setCacheStoreForTests,
  type CacheStore,
} from "./cache.server.ts";

function createFakeStore(overrides: Partial<CacheStore> = {}): CacheStore & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    data,
    isReady: true,
    mGet: async (keys) => keys.map((key) => data.get(key) ?? null),
    set: async (key, value) => void data.set(key, value),
    incr: async (key) => {
      const next = Number(data.get(key) ?? "0") + 1;
      data.set(key, String(next));
      return next;
    },
    ...overrides,
  };
}

const scope = {
  tenantId: "tenant-a",
  userId: "user-1",
  name: "dashboard:overview",
  ttlSeconds: 60,
};

afterEach(() => setCacheStoreForTests(undefined));

test("second read is a hit and does not run the loader", async () => {
  setCacheStoreForTests(createFakeStore());
  let loads = 0;
  const load = async () => ({ value: ++loads });

  assert.deepEqual(await cached(scope, load), { value: 1 });
  assert.deepEqual(await cached(scope, load), { value: 1 });
  assert.equal(loads, 1);
  assert.deepEqual(getCacheStats(), { hits: 1, misses: 1, bypassed: 0, errors: 0 });
});

test("entries are isolated per user and per tenant", async () => {
  setCacheStoreForTests(createFakeStore());
  await cached(scope, async () => "user-1 private");

  assert.equal(
    await cached({ ...scope, userId: "user-2" }, async () => "user-2 private"),
    "user-2 private",
  );
  assert.equal(
    await cached({ ...scope, tenantId: "tenant-b" }, async () => "tenant-b private"),
    "tenant-b private",
  );
  assert.equal(await cached(scope, async () => "unused"), "user-1 private");
});

test("invalidating a tenant forces a reload for that tenant only", async () => {
  setCacheStoreForTests(createFakeStore());
  const other = { ...scope, tenantId: "tenant-b" };
  await cached(scope, async () => "old");
  await cached(other, async () => "other");

  await invalidateTenantCache("tenant-a");

  assert.equal(await cached(scope, async () => "new"), "new");
  assert.equal(await cached(other, async () => "unused"), "other");
});

test("a write that lands during a load leaves the stored entry invalid", async () => {
  setCacheStoreForTests(createFakeStore());
  await cached(scope, async () => {
    await invalidateTenantCache("tenant-a");
    return "read before the write committed";
  });
  assert.equal(await cached(scope, async () => "fresh"), "fresh");
});

test("falls back to the loader when Redis commands fail", async () => {
  setCacheStoreForTests(
    createFakeStore({
      mGet: async () => {
        throw new Error("connection reset");
      },
      incr: async () => {
        throw new Error("connection reset");
      },
    }),
  );
  assert.equal(await cached(scope, async () => "from database"), "from database");
  await assert.doesNotReject(invalidateTenantCache("tenant-a"));
  assert.equal(getCacheStats().errors, 2);
});

test("after an undelivered invalidation the cache is not read until entries expire", async () => {
  const store = createFakeStore();
  setCacheStoreForTests(store);
  await cached(scope, async () => "old");
  store.incr = async () => {
    throw new Error("connection reset");
  };
  await invalidateTenantCache("tenant-a");
  assert.equal(await cached(scope, async () => "new"), "new");
});

test("falls back when Redis hangs, is disconnected, is unconfigured, or there is no tenant", async () => {
  setCacheStoreForTests(createFakeStore({ mGet: () => new Promise(() => undefined) }));
  assert.equal(await cached(scope, async () => "after timeout"), "after timeout");

  setCacheStoreForTests(createFakeStore({ isReady: false }));
  assert.equal(await cached(scope, async () => "disconnected"), "disconnected");

  setCacheStoreForTests(null);
  assert.equal(await cached(scope, async () => "unconfigured"), "unconfigured");

  const store = createFakeStore();
  setCacheStoreForTests(store);
  assert.equal(await cached({ ...scope, tenantId: null }, async () => "no tenant"), "no tenant");
  assert.equal(store.data.size, 0);
});

test("loader errors propagate and are not cached", async () => {
  const store = createFakeStore();
  setCacheStoreForTests(store);
  await assert.rejects(
    cached(scope, async () => {
      throw new Error("database down");
    }),
    /database down/,
  );
  assert.equal(store.data.size, 0);
  assert.equal(await cached(scope, async () => "recovered"), "recovered");
});

test("concurrent requests for one key share a single load", async () => {
  setCacheStoreForTests(createFakeStore());
  let loads = 0;
  const load = async () => {
    loads += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return "shared";
  };
  const results = await Promise.all([
    cached(scope, load),
    cached(scope, load),
    cached(scope, load),
  ]);
  assert.deepEqual(results, ["shared", "shared", "shared"]);
  assert.equal(loads, 1);
});

test("production Redis must use TLS unless it is on loopback", () => {
  assert.equal(isAllowedRedisUrl("rediss://cache.example.com:6379", true), true);
  assert.equal(isAllowedRedisUrl("redis://cache.example.com:6379", true), false);
  assert.equal(isAllowedRedisUrl("redis://127.0.0.1:6379", true), true);
  assert.equal(isAllowedRedisUrl("redis://cache.example.com:6379", false), true);
  assert.equal(isAllowedRedisUrl("https://cache.example.com", true), false);
  assert.equal(isAllowedRedisUrl("not a url", false), false);
});

test("a read that starts after an invalidation never joins an older in-flight load", async () => {
  setCacheStoreForTests(createFakeStore());
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));

  const before = cached(scope, async () => {
    await gate;
    return "before write";
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await invalidateTenantCache("tenant-a");
  const after = cached(scope, async () => "after write");
  release();

  assert.equal(await before, "before write");
  assert.equal(await after, "after write");
});

test("a hung Redis is skipped for later calls instead of delaying every request", async () => {
  let reads = 0;
  setCacheStoreForTests(
    createFakeStore({
      mGet: () => {
        reads += 1;
        return new Promise(() => undefined);
      },
    }),
  );
  await cached(scope, async () => "first pays the timeout");
  const started = performance.now();
  assert.equal(await cached(scope, async () => "second"), "second");
  assert.ok(performance.now() - started < 100, "second call must not wait for Redis");
  assert.equal(reads, 1);
});
