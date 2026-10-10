import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import { fetchAiGateway, requestStructuredAiOutput } from "./ai-gateway.server.ts";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.LOVABLE_API_KEY;
const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
const originalOpenRouterUrl = process.env.OPENROUTER_APP_URL;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.LOVABLE_API_KEY;
  else process.env.LOVABLE_API_KEY = originalApiKey;
  if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
  if (originalOpenRouterUrl === undefined) delete process.env.OPENROUTER_APP_URL;
  else process.env.OPENROUTER_APP_URL = originalOpenRouterUrl;
});

test("uses OpenRouter server credentials without exposing them in the request body", async () => {
  delete process.env.LOVABLE_API_KEY;
  process.env.OPENROUTER_API_KEY = "openrouter-test-only";
  process.env.OPENROUTER_APP_URL = "https://staffinix.example";
  let observedUrl = "";
  let observedHeaders = new Headers();
  let observedBody = "";
  globalThis.fetch = async (input, init) => {
    observedUrl = String(input);
    observedHeaders = new Headers(init?.headers);
    observedBody = String(init?.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
      status: 200,
    });
  };

  await fetchAiGateway("/v1/chat/completions", { model: "test/model" });

  assert.equal(observedUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(observedHeaders.get("authorization"), "Bearer openrouter-test-only");
  assert.equal(observedHeaders.get("HTTP-Referer"), "https://staffinix.example");
  assert.equal(observedHeaders.get("X-OpenRouter-Title"), "Staffinix");
  assert.equal(observedBody.includes("openrouter-test-only"), false);
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
