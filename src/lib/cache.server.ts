// Server-only Redis read cache. Never import from client code.
//
// Redis is an optimisation, never a dependency: when REDIS_URL is unset, the
// connection is down, or a command is slow, callers get the loader's result
// straight from the database.

/** The three commands the cache needs; the real client and test fakes both satisfy it. */
export interface CacheStore {
  readonly isReady: boolean;
  mGet(keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  incr(key: string): Promise<number>;
}

export interface CacheScope {
  /** Null (no tenant) disables caching for the call. */
  tenantId: string | null;
  userId: string;
  /** Static label such as "dashboard:overview". Never put request data here. */
  name: string;
  ttlSeconds: number;
}

const KEY_PREFIX = "sx:v1";
const COMMAND_TIMEOUT_MS = 250;
/** Upper bound for any entry, and how long a missed invalidation could leave stale data. */
const MAX_TTL_SECONDS = 60;
/** After a failed command, skip Redis this long instead of making every request wait. */
const FAILURE_COOLDOWN_MS = 5_000;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const stats = { hits: 0, misses: 0, bypassed: 0, errors: 0 };
const inFlight = new Map<string, Promise<unknown>>();
let storePromise: Promise<CacheStore | null> | undefined;
let skipUntil = 0;

export function getCacheStats(): Readonly<typeof stats> {
  return { ...stats };
}

/** Test seam: inject a fake store, or pass undefined to return to REDIS_URL. */
export function setCacheStoreForTests(store: CacheStore | null | undefined): void {
  storePromise = store === undefined ? undefined : Promise.resolve(store);
  inFlight.clear();
  skipUntil = 0;
  stats.hits = stats.misses = stats.bypassed = stats.errors = 0;
}

/** Production must use TLS unless Redis is on the same host. */
export function isAllowedRedisUrl(value: string, production: boolean): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === "rediss:") return true;
  return url.protocol === "redis:" && (!production || LOOPBACK_HOSTS.has(url.hostname));
}

async function connect(): Promise<CacheStore | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (!isAllowedRedisUrl(url, process.env.NODE_ENV === "production")) {
    console.error("[cache] REDIS_URL rejected: production requires rediss:// (TLS)");
    return null;
  }
  try {
    const { createClient } = await import("redis");
    const client = createClient({
      url,
      // Fail fast while disconnected instead of queueing commands behind a dead socket.
      disableOfflineQueue: true,
      socket: {
        connectTimeout: 2_000,
        reconnectStrategy: (retries) => Math.min(retries * 200, 5_000),
      },
    });
    // Without a listener node-redis throws on socket errors. Log the code only:
    // the error object can carry the connection URL and its password.
    // Logged once per outage, not once per retry.
    let reportedDown = false;
    client.on("error", (error: { code?: string; name?: string }) => {
      stats.errors += 1;
      if (reportedDown) return;
      reportedDown = true;
      console.error("[cache] redis error", error?.code ?? error?.name ?? "unknown");
    });
    client.on("ready", () => {
      reportedDown = false;
      console.info("[cache] redis ready");
    });
    // Not awaited: requests bypass the cache until isReady, and the client keeps retrying.
    void client.connect().catch(() => undefined);
    return client;
  } catch {
    console.error("[cache] redis client failed to initialise");
    return null;
  }
}

/** The store, or null when Redis is unconfigured, disconnected, or cooling down after a failure. */
async function getUsableStore(): Promise<CacheStore | null> {
  storePromise ??= connect();
  const store = await storePromise;
  return store?.isReady && Date.now() >= skipUntil ? store : null;
}

function commandFailed(cooldownMs = FAILURE_COOLDOWN_MS): void {
  stats.errors += 1;
  skipUntil = Math.max(skipUntil, Date.now() + cooldownMs);
}

function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("cache timeout")), COMMAND_TIMEOUT_MS);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

function record(name: string, result: "hit" | "miss" | "bypass"): void {
  if (result === "hit") stats.hits += 1;
  else if (result === "miss") stats.misses += 1;
  else stats.bypassed += 1;
  // Fixed scalar fields only, so log-based metrics can compute the hit ratio.
  console.info(JSON.stringify({ event: "cache", name, result }));
}

const epochKey = (tenantId: string) => `${KEY_PREFIX}:t:${tenantId}:epoch`;

/**
 * Return a cached value for this tenant + user, or run `load` and cache its result.
 *
 * Keys always contain both the tenant and the user, so one user's entry can never
 * be served to another. Each entry stores the tenant epoch it was read under and
 * is ignored once `invalidateTenantCache` bumps that epoch. Loader errors are
 * never cached.
 */
export async function cached<T>(scope: CacheScope, load: () => Promise<T>): Promise<T> {
  const store = scope.tenantId ? await getUsableStore() : null;
  if (!store || !scope.tenantId) {
    record(scope.name, "bypass");
    return load();
  }

  const key = `${KEY_PREFIX}:t:${scope.tenantId}:u:${scope.userId}:${scope.name}`;
  let epoch: string;
  try {
    const [raw, currentEpoch] = await withTimeout(store.mGet([key, epochKey(scope.tenantId)]));
    epoch = currentEpoch ?? "0";
    if (raw) {
      const entry = JSON.parse(raw) as { e: string; d: T };
      if (entry.e === epoch) {
        record(scope.name, "hit");
        return entry.d;
      }
    }
  } catch {
    commandFailed();
    record(scope.name, "bypass");
    return load();
  }

  // Single flight per key *and epoch*: concurrent misses share one load, but a
  // read that starts after an invalidation never joins a load from before it.
  const flightKey = `${key}@${epoch}`;
  const pending = inFlight.get(flightKey) as Promise<T> | undefined;
  if (pending) {
    record(scope.name, "miss");
    return pending;
  }

  const run = (async () => {
    record(scope.name, "miss");
    const data = await load();
    try {
      // Tagged with the epoch read *before* the load, so a write that lands
      // mid-load leaves this entry already invalid.
      await withTimeout(
        store.set(key, JSON.stringify({ e: epoch, d: data }), {
          EX: Math.min(scope.ttlSeconds, MAX_TTL_SECONDS),
        }),
      );
    } catch {
      commandFailed();
    }
    return data;
  })();

  inFlight.set(flightKey, run);
  try {
    return await run;
  } finally {
    inFlight.delete(flightKey);
  }
}

/**
 * Invalidate every cached entry for a tenant.
 *
 * If the invalidation cannot be delivered, this instance stops reading the
 * cache until every entry that could now be stale has expired.
 */
export async function invalidateTenantCache(tenantId: string | null): Promise<void> {
  if (!tenantId) return;
  storePromise ??= connect();
  const configured = await storePromise;
  if (!configured) return;
  const store = await getUsableStore();
  try {
    if (!store) throw new Error("cache unavailable");
    await withTimeout(store.incr(epochKey(tenantId)));
  } catch {
    commandFailed(MAX_TTL_SECONDS * 1_000);
  }
}
