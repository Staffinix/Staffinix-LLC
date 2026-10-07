import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";

import JSZip from "jszip";

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function runJob(bytes, mimeType = PDF_MIME) {
  return new Promise((resolve, reject) => {
    const isolated = Uint8Array.from(bytes);
    const worker = new Worker(new URL("./document-job.mjs", import.meta.url), {
      workerData: { bytes: isolated.buffer, mimeType },
      transferList: [isolated.buffer],
    });
    // The production worker enforces an 8-second job deadline. Keep the test
    // harness above that boundary so a loaded CI runner does not fail before
    // the behavior under test has a chance to report its own result.
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error("test worker timed out"));
    }, 12_000);
    worker.once("message", (message) => {
      clearTimeout(timer);
      void worker.terminate();
      resolve(message);
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function fakeDocxDirectory(entries) {
  const localHeaderSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const records = entries.map(({ name, compressed, expanded }) => {
    const encodedName = Buffer.from(name, "utf8");
    const record = Buffer.alloc(46 + encodedName.length);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt32LE(compressed, 20);
    record.writeUInt32LE(expanded, 24);
    record.writeUInt16LE(encodedName.length, 28);
    encodedName.copy(record, 46);
    return record;
  });
  const directory = Buffer.concat(records);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(localHeaderSignature.length, 16);
  return Buffer.concat([localHeaderSignature, directory, end]);
}

async function createDocx(text) {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const archive = new JSZip();
  archive.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  archive.file(
    "_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  archive.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${escaped}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

test("accepts a small inert PDF with valid magic bytes and trailer", async () => {
  const bytes = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF", "latin1");
  const result = await runJob(bytes);
  assert.equal(result.clean, true);
  assert.equal(result.mime_type, PDF_MIME);
  assert.equal(result.size_bytes, bytes.length);
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
});

test("rejects a declared PDF whose magic bytes do not match", async () => {
  const result = await runJob(Buffer.from("not a pdf\n%%EOF", "latin1"));
  assert.match(result.error, /signature/i);
});

test("rejects active PDF JavaScript", async () => {
  const bytes = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /OpenAction 2 0 R /JS (app.alert('x')) >>\nendobj\n%%EOF",
    "latin1",
  );
  const result = await runJob(bytes);
  assert.match(result.error, /active or encrypted/i);
});

test("rejects a DOCX-shaped payload without a valid central directory", async () => {
  const result = await runJob(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]), DOCX_MIME);
  assert.match(result.error, /central directory/i);
});

test("extracts DOCX content as plain text only", async () => {
  const bytes = await createDocx("Candidate supplied <script>alert(1)</script> as literal text");
  const result = await runJob(bytes, DOCX_MIME);
  assert.equal(result.clean, true);
  assert.equal(result.mime_type, DOCX_MIME);
  assert.equal(
    result.extracted_text,
    "Candidate supplied <script>alert(1)</script> as literal text",
  );
  assert.equal("html" in result, false);
});

test("rejects unsafe directional control characters in extracted text", async () => {
  const bytes = await createDocx("Candidate supplied safe text followed by \u202eevil.exe");
  const result = await runJob(bytes, DOCX_MIME);
  assert.match(result.error, /unsafe control characters/i);
});

test("rejects a DOCX zip bomb before decompression", async () => {
  const bytes = fakeDocxDirectory([
    { name: "[Content_Types].xml", compressed: 1, expanded: 1_000_000 },
    { name: "word/document.xml", compressed: 1, expanded: 1 },
  ]);
  const result = await runJob(bytes, DOCX_MIME);
  assert.match(result.error, /compression ratio|expansion limit/i);
});

test("rejects DOCX archive path traversal", async () => {
  const bytes = fakeDocxDirectory([
    { name: "../payload.js", compressed: 1, expanded: 1 },
    { name: "word/document.xml", compressed: 1, expanded: 1 },
  ]);
  const result = await runJob(bytes, DOCX_MIME);
  assert.match(result.error, /unsafe archive path/i);
});

test("rejects documents over the fixed file-size ceiling", async () => {
  const result = await runJob(new Uint8Array(10 * 1024 * 1024 + 1));
  assert.match(result.error, /file size limit/i);
});
