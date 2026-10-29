import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { createAuthCacheHandler } from "./auth-query-cache.ts";

const session = (id: string) => ({ user: { id } }) as Session;

test("cross-tab sign-out and account switch remove private query and mutation caches", () => {
  for (const event of ["SIGNED_OUT", "SIGNED_IN"] as const) {
    const client = new QueryClient();
    let invalidations = 0;
    const handle = createAuthCacheHandler(client, () => invalidations++);
    handle("INITIAL_SESSION", session("a"));
    client.setQueryData(["me"], { id: "a" });
    client.setQueryData(["candidate", "private"], { email: "private@example.test" });
    client.getMutationCache().build(client, { mutationKey: ["private"] });
    handle(event, event === "SIGNED_OUT" ? null : session("b"));
    assert.equal(client.getQueryCache().getAll().length, 0);
    assert.equal(client.getMutationCache().getAll().length, 0);
    assert.equal(invalidations, 1);
    client.clear();
  }
});

test("same-user focus and token events preserve fresh data; user edits invalidate it", () => {
  const client = new QueryClient();
  let invalidations = 0;
  const handle = createAuthCacheHandler(client, () => invalidations++);
  handle("INITIAL_SESSION", session("a"));
  client.setQueryData(["me"], { id: "a" });
  handle("SIGNED_IN", session("a"));
  handle("TOKEN_REFRESHED", session("a"));
  assert.equal(client.getQueryState(["me"])?.isInvalidated, false);
  assert.equal(invalidations, 0);
  handle("USER_UPDATED", session("a"));
  assert.equal(client.getQueryState(["me"])?.isInvalidated, true);
  assert.equal(invalidations, 1);
  client.clear();
});

test("a request from the previous account cannot repopulate the cache", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const handle = createAuthCacheHandler(client, () => {});
  handle("INITIAL_SESSION", session("a"));
  let resolve!: (data: string) => void;
  const pending = client
    .fetchQuery({
      queryKey: ["private"],
      queryFn: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    })
    .catch(() => undefined);
  handle("SIGNED_OUT", null);
  resolve("previous account data");
  await pending;
  assert.equal(client.getQueryData(["private"]), undefined);
  client.clear();
});
