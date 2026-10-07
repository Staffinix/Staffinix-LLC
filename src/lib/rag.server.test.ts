import assert from "node:assert/strict";
import test from "node:test";

import { chunkDocumentText } from "./rag.server.ts";

test("chunks text with overlap without losing words", () => {
  const words = Array.from({ length: 210 }, (_, index) => `word${index}`);
  const chunks = chunkDocumentText(words.join(" "), { maxWords: 100, overlapWords: 20 });
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].split(" ").length, 100);
  assert.equal(chunks[1].split(" ")[0], "word80");
  assert.equal(chunks[2].split(" ")[0], "word160");
  assert.equal(chunks[2].split(" ").at(-1), "word209");
});

test("normalizes unsafe controls and ignores empty documents", () => {
  assert.deepEqual(chunkDocumentText(" \n\t "), []);
  assert.equal(chunkDocumentText("alpha\u0000 beta").join(" "), "alpha beta");
});
