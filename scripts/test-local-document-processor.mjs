import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Document, Packer, Paragraph } from "docx";
import { processDocumentForExtraction } from "../src/lib/document-processing.server.ts";

const endpoint = new URL(process.env.DOCUMENT_PROCESSOR_URL ?? "http://127.0.0.1:8788");
assert.equal(
  endpoint.origin,
  "http://127.0.0.1:8788",
  "This test must use the local processor only.",
);
assert.ok(process.env.DOCUMENT_PROCESSOR_TOKEN?.length >= 32, "Load the local environment file.");
const headers = { authorization: `Bearer ${process.env.DOCUMENT_PROCESSOR_TOKEN}` };
const post = (bytes, mime, authorized = true) =>
  fetch(new URL("/v1/process", endpoint), {
    method: "POST",
    headers: { ...(authorized ? headers : {}), "content-type": mime },
    body: bytes,
    signal: AbortSignal.timeout(20000),
  });
assert.equal((await fetch(new URL("/health", endpoint))).status, 200);
assert.equal((await post(Buffer.from("not authorized"), "application/pdf", false)).status, 401);
assert.equal((await post(Buffer.from("not a resume"), "text/plain")).status, 415);
const invalidPdf = Buffer.from("not a PDF document");
assert.equal((await post(invalidPdf, "application/pdf")).status, 422);
const office = await Packer.toBuffer(
  new Document({
    sections: [
      { children: [new Paragraph("Local document processor Word extraction verification.")] },
    ],
  }),
);
const docx = await processDocumentForExtraction({
  bytes: office,
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});
assert.equal(docx.validated, true);
assert.match(docx.extracted_text, /Word extraction verification/);
if (process.argv[2]) {
  const pdf = await processDocumentForExtraction({
    bytes: await readFile(process.argv[2]),
    mimeType: "application/pdf",
  });
  assert.equal(pdf.validated, true);
  console.log(
    "Provided PDF passed structural validation and response-integrity checks.",
  );
}
console.log(
  "Local integration checks passed: authentication, file-type restriction, invalid-document rejection, and DOCX extraction. No AI calls or candidate records created.",
);
