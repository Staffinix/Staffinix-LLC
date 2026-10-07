import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../integrations/supabase/types.ts";
import { runWithAiUsageGuard } from "./ai-usage.server.ts";

function clientWithReservation(error: unknown = null): SupabaseClient<Database> {
  return {
    rpc: async () => ({ data: {}, error }),
  } as unknown as SupabaseClient<Database>;
}

test("reserves database quota before running an AI task", async () => {
  let ran = false;
  const result = await runWithAiUsageGuard(
    clientWithReservation(),
    "aaaaaaaa-0000-4000-8000-000000000001",
    "copilot",
    async () => {
      ran = true;
      return "ok";
    },
  );
  assert.equal(ran, true);
  assert.equal(result, "ok");
});

test("does not run the task when the database quota is exhausted", async () => {
  let ran = false;
  await assert.rejects(
    runWithAiUsageGuard(
      clientWithReservation({ code: "P0001" }),
      "bbbbbbbb-0000-4000-8000-000000000001",
      "candidate_parse",
      async () => {
        ran = true;
      },
    ),
    /usage limit reached/i,
  );
  assert.equal(ran, false);
});

test("limits concurrent AI work per user inside an application instance", async () => {
  const resolvers: Array<() => void> = [];
  const task = () => new Promise<void>((resolve) => resolvers.push(resolve));
  const client = clientWithReservation();
  const userId = "cccccccc-0000-4000-8000-000000000001";

  const first = runWithAiUsageGuard(client, userId, "copilot", task);
  const second = runWithAiUsageGuard(client, userId, "copilot", task);
  await Promise.resolve();

  await assert.rejects(
    runWithAiUsageGuard(client, userId, "copilot", async () => undefined),
    /too many AI requests/i,
  );

  resolvers.splice(0).forEach((resolve) => resolve());
  await Promise.all([first, second]);
});
