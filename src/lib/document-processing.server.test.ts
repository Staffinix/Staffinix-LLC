import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { processDocumentForExtraction } from "./document-processing.server.ts";

test("PDF auto-fill validates locally without contacting a document service", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("PDF processing must not make a network request");
  });
  const bytes = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF");
  const result = await processDocumentForExtraction({ bytes, mimeType: "application/pdf" });
  assert.equal(result.validated, true);
  assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(result.size_bytes, bytes.length);
  assert.equal(result.extracted_text, null);
  assert.equal("clean" in result, false);
});

test("PDF auto-fill still rejects invalid, active, and oversized files", async () => {
  for (const bytes of [
    Buffer.from("not a PDF\n%%EOF"),
    Buffer.from("%PDF-1.4\nmissing end marker"),
    Buffer.from("%PDF-1.4\n/JavaScript (unsafe)\n%%EOF"),
    new Uint8Array(10 * 1024 * 1024 + 1),
  ]) {
    await assert.rejects(processDocumentForExtraction({ bytes, mimeType: "application/pdf" }));
  }
});
