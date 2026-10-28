import { jsPDF } from "jspdf";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { processDocumentForExtraction } from "./document-processing.server.ts";

// jsPDF adds a page-navigation OpenAction; omit it without changing xref offsets.
function inertPdf(doc: jsPDF) {
  const raw = Buffer.from(doc.output("arraybuffer")).toString("latin1");
  return new Uint8Array(Buffer.from(raw.replace(/\/OpenAction[^\r\n]*/g, (value) => " ".repeat(value.length)), "latin1"));
}

test("PDF auto-fill validates locally without contacting a document service", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("PDF processing must not make a network request");
  });
  const doc = new jsPDF();
  doc.text("Verified source resume: Java developer", 10, 10);
  const bytes = inertPdf(doc);
  const result = await processDocumentForExtraction({ bytes, mimeType: "application/pdf" });
  assert.equal(result.validated, true);
  assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(result.size_bytes, bytes.length);
  assert.match(result.extracted_text!, /Verified source resume: Java developer/);
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

test("image-only PDFs have no invented source text", async () => {
  const doc = new jsPDF();
  const result = await processDocumentForExtraction({
    bytes: inertPdf(doc),
    mimeType: "application/pdf",
  });
  assert.equal(result.extracted_text, null);
});
