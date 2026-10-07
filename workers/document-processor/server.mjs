import { createServer } from "node:http";
import { connect } from "node:net";
import { timingSafeEqual } from "node:crypto";
import { Worker } from "node:worker_threads";

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const JOB_TIMEOUT_MS = 8_000;
const SCAN_TIMEOUT_MS = 8_000;
const PORT = Number(process.env.PORT ?? 8788);
const TOKEN = process.env.DOCUMENT_PROCESSOR_TOKEN ?? "";
const CLAMAV_HOST = process.env.CLAMAV_HOST ?? "";
const CLAMAV_PORT = Number(process.env.CLAMAV_PORT ?? 3310);
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

if (TOKEN.length < 32)
  throw new Error("DOCUMENT_PROCESSOR_TOKEN must contain at least 32 characters");
if (!CLAMAV_HOST) throw new Error("CLAMAV_HOST is required; malware scanning fails closed");

function authorized(header) {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(TOKEN);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function json(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(payload);
}

async function readLimitedBody(request) {
  const declared = Number(request.headers["content-length"]);
  if (!Number.isSafeInteger(declared) || declared < 1 || declared > MAX_BODY_BYTES) {
    throw new Error("Invalid content length");
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES || total > declared) {
      request.destroy();
      throw new Error("Body limit exceeded");
    }
    chunks.push(chunk);
  }
  if (total !== declared) throw new Error("Content length mismatch");
  return Buffer.concat(chunks, total);
}

function scanWithClamAv(bytes) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: CLAMAV_HOST, port: CLAMAV_PORT });
    const timer = setTimeout(
      () => socket.destroy(new Error("Malware scan timed out")),
      SCAN_TIMEOUT_MS,
    );
    let reply = "";
    socket.setNoDelay(true);
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
        const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + 64 * 1024));
        const length = Buffer.allocUnsafe(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.end(Buffer.alloc(4));
    });
    socket.on("data", (chunk) => {
      reply += chunk.toString("utf8");
      if (reply.length > 4096) socket.destroy(new Error("Invalid malware scanner response"));
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("close", () => {
      clearTimeout(timer);
      if (reply.includes(" FOUND")) reject(new Error("Malware detected"));
      else if (reply.includes(" OK")) resolve();
      else reject(new Error("Malware scanner did not return a clean result"));
    });
  });
}

function processInConstrainedWorker(bytes, mimeType) {
  return new Promise((resolve, reject) => {
    const isolatedBytes = Uint8Array.from(bytes);
    const worker = new Worker(new URL("./document-job.mjs", import.meta.url), {
      workerData: { bytes: isolatedBytes.buffer, mimeType },
      transferList: [isolatedBytes.buffer],
      resourceLimits: {
        maxOldGenerationSizeMb: 64,
        maxYoungGenerationSizeMb: 16,
        codeRangeSizeMb: 16,
        stackSizeMb: 2,
      },
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error("Document CPU/wall-clock limit exceeded"));
    }, JOB_TIMEOUT_MS);
    worker.once("message", (message) => {
      clearTimeout(timer);
      void worker.terminate();
      if (message?.error) reject(new Error(message.error));
      else resolve(message);
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health")
    return json(response, 200, { ok: true });
  if (request.method !== "POST" || request.url !== "/v1/process")
    return json(response, 404, { error: "Not found" });
  if (!authorized(request.headers.authorization))
    return json(response, 401, { error: "Unauthorized" });
  const mimeType = String(request.headers["content-type"] ?? "").split(";", 1)[0];
  if (!ALLOWED_TYPES.has(mimeType))
    return json(response, 415, { error: "Unsupported document type" });

  try {
    const bytes = await readLimitedBody(request);
    await scanWithClamAv(bytes);
    const result = await processInConstrainedWorker(bytes, mimeType);
    return json(response, 200, result);
  } catch {
    return json(response, 422, { error: "Document rejected" });
  }
}).listen(PORT, "0.0.0.0");
