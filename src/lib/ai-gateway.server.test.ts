import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import { fetchAiGateway, requestStructuredAiOutput } from "./ai-gateway.server.ts";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.LOVABLE_API_KEY;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.LOVABLE_API_KEY;
  else process.env.LOVABLE_API_KEY = originalApiKey;
});

test("validates schema-bound AI output", async () => {
  process.env.LOVABLE_API_KEY = "test-only";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: JSON.stringify({ value: 7 }) } }],
      }),
      { status: 200 },
    );

  const result = await requestStructuredAiOutput(
    { model: "test" },
    z.object({ value: z.number().int().min(0).max(10) }).strict(),
  );
  assert.deepEqual(result, { value: 7 });
});

test("rejects AI output that violates the caller's schema", async () => {
  process.env.LOVABLE_API_KEY = "test-only";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          { message: { content: JSON.stringify({ value: 7, injected_instruction: "ignore" }) } },
        ],
      }),
      { status: 200 },
    );

  await assert.rejects(
    requestStructuredAiOutput({ model: "test" }, z.object({ value: z.number().int() }).strict()),
    /Unrecognized key/,
  );
});

test("aborts an AI request at the hard deadline", async () => {
  process.env.LOVABLE_API_KEY = "test-only";
  globalThis.fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
    });

  await assert.rejects(fetchAiGateway("/v1/embeddings", {}, 10), /timed out/i);
});

test("rejects oversized AI responses while streaming", async () => {
  process.env.LOVABLE_API_KEY = "test-only";
  globalThis.fetch = async () => new Response("x".repeat(512 * 1024 + 1), { status: 200 });

  await assert.rejects(fetchAiGateway("/v1/embeddings", {}), /AI request failed/);
});
