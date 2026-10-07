import { parentPort, workerData } from "node:worker_threads";
import { createHash } from "node:crypto";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 500;
const MAX_ARCHIVE_EXPANDED_BYTES = 25 * 1024 * 1024;
const MAX_ENTRY_EXPANDED_BYTES = 8 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;
const MAX_TEXT_CHARS = 60_000;
const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const UNSAFE_PLAIN_TEXT_CONTROLS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;

function reject(message) {
  throw new Error(message);
}

function validatePdf(bytes) {
  const header = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 1024))).toString("latin1");
  const trailer = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 4096))).toString("latin1");
  if (!header.startsWith("%PDF-")) reject("PDF signature is missing");
  if (!trailer.includes("%%EOF")) reject("PDF end marker is missing");

  const source = Buffer.from(bytes).toString("latin1");
  const blocked = [
    /\/JavaScript\b/i,
    /\/JS\b/i,
    /\/Launch\b/i,
    /\/EmbeddedFile\b/i,
    /\/OpenAction\b/i,
    /\/RichMedia\b/i,
    /\/XFA\b/i,
    /\/Encrypt\b/i,
  ];
  if (blocked.some((pattern) => pattern.test(source)))
    reject("PDF contains active or encrypted content");
  if ((source.match(/\b\d+\s+\d+\s+obj\b/g) ?? []).length > 10_000)
    reject("PDF object limit exceeded");
  if ((source.match(/\bstream[\r\n]/g) ?? []).length > 2_000) reject("PDF stream limit exceeded");
  return null;
}

function readDocxDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimum = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) reject("DOCX central directory is missing");
  const entries = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (entries < 1 || entries > MAX_ARCHIVE_ENTRIES) reject("DOCX entry limit exceeded");
  if (directorySize > 2 * 1024 * 1024 || directoryOffset + directorySize > bytes.length) {
    reject("DOCX central directory is invalid");
  }

  let offset = directoryOffset;
  const directoryEnd = directoryOffset + directorySize;
  let expandedTotal = 0;
  const names = new Set();
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      reject("DOCX central directory entry is invalid");
    }
    const flags = view.getUint16(offset + 8, true);
    const compressed = view.getUint32(offset + 20, true);
    const expanded = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if ((flags & 1) !== 0) reject("Encrypted DOCX entries are not allowed");
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > directoryEnd) reject("DOCX entry name is invalid");
    const name = Buffer.from(bytes.subarray(nameStart, nameEnd)).toString("utf8");
    if (
      name.startsWith("/") ||
      name.includes("../") ||
      name.includes("\\") ||
      /[\u0000-\u001f]/.test(name)
    ) {
      reject("DOCX contains an unsafe archive path");
    }
    if (names.has(name)) reject("DOCX contains duplicate archive entries");
    if (/\.(zip|7z|rar|gz|exe|dll|js|vbs|ps1)$/i.test(name) || /vbaProject\.bin$/i.test(name)) {
      reject("DOCX contains nested, executable, or macro content");
    }
    if (expanded > MAX_ENTRY_EXPANDED_BYTES) reject("DOCX entry expansion limit exceeded");
    if (compressed === 0 ? expanded > 0 : expanded / compressed > MAX_COMPRESSION_RATIO) {
      reject("DOCX compression ratio limit exceeded");
    }
    expandedTotal += expanded;
    if (expandedTotal > MAX_ARCHIVE_EXPANDED_BYTES) reject("DOCX expansion limit exceeded");
    names.add(name);
    offset = nameEnd + extraLength + commentLength;
    if (offset > directoryEnd) reject("DOCX central directory entry is invalid");
  }
  if (offset !== directoryEnd) reject("DOCX central directory size is invalid");
  if (!names.has("[Content_Types].xml") || !names.has("word/document.xml")) {
    reject("File is not a valid Word document");
  }
}

async function main() {
  const bytes = new Uint8Array(workerData.bytes);
  const mimeType = workerData.mimeType;
  if (bytes.length < 1 || bytes.length > MAX_FILE_BYTES) reject("File size limit exceeded");

  let extractedText = null;
  if (mimeType === PDF_MIME) {
    validatePdf(bytes);
  } else if (mimeType === DOCX_MIME) {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
      reject("DOCX ZIP signature is missing");
    }
    readDocxDirectory(bytes);
    const mammoth = await import("mammoth");
    // extractRawText does not generate HTML and calls Mammoth's DOCX reader
    // with external-file access disabled. Never replace this with an HTML conversion API.
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    if (typeof result.value !== "string" || !Array.isArray(result.messages)) {
      reject("DOCX parser returned an invalid result");
    }
    if (result.messages.length > 100) reject("DOCX parser warning limit exceeded");
    for (const message of result.messages) {
      if (
        !message ||
        !["warning", "error"].includes(message.type) ||
        typeof message.message !== "string" ||
        message.message.length > 2_000
      ) {
        reject("DOCX parser returned an invalid warning");
      }
      if (message.type === "error") reject("DOCX parser reported an error");
    }
    extractedText = result.value.normalize("NFC").trim();
    if (extractedText.length < 20 || extractedText.length > MAX_TEXT_CHARS) {
      reject("Extracted DOCX text is outside the permitted range");
    }
    if (UNSAFE_PLAIN_TEXT_CONTROLS.test(extractedText)) {
      reject("Extracted DOCX text contains unsafe control characters");
    }
  } else {
    reject("Unsupported document MIME type");
  }

  parentPort.postMessage({
    version: 1,
    clean: true,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    mime_type: mimeType,
    size_bytes: bytes.length,
    extracted_text: extractedText,
  });
}

main().catch((error) =>
  parentPort.postMessage({ error: error instanceof Error ? error.message : "Rejected" }),
);
