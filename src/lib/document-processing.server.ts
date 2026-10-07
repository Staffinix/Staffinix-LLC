import { z } from "zod";
import { getServerServiceUrl } from "./server-service-url.ts";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_TEXT_CHARS = 60_000;
export const DOCUMENT_PROCESSING_TIMEOUT_MS = 15_000;

const WorkerResultSchema = z
  .object({
    version: z.literal(1),
    clean: z.literal(true),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    mime_type: z.enum([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
    size_bytes: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
    extracted_text: z.string().max(MAX_DOCUMENT_TEXT_CHARS).nullable(),
  })
  .strict();

export type ProcessedDocument = z.infer<typeof WorkerResultSchema>;

async function readLimitedWorkerResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let result = "";
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 100_000) {
        await reader.cancel();
        throw new Error("Document worker returned an oversized result");
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function processDocumentInIsolatedWorker(input: {
  bytes: Uint8Array;
  mimeType: string;
}): Promise<ProcessedDocument> {
  if (input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error("Document is outside the permitted file-size range");
  }

  const configuredWorkerUrl = process.env.DOCUMENT_PROCESSOR_URL?.trim();
  const workerToken = process.env.DOCUMENT_PROCESSOR_TOKEN?.trim();
  if (!configuredWorkerUrl || !workerToken) {
    throw new Error("Isolated document processing is not configured");
  }
  const workerUrl = getServerServiceUrl({
    name: "DOCUMENT_PROCESSOR_URL",
    configuredValue: configuredWorkerUrl,
    developmentDefault: "http://127.0.0.1:8788",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOCUMENT_PROCESSING_TIMEOUT_MS);
  let response: Response;
  let responseText: string;
  try {
    response = await fetch(new URL("/v1/process", workerUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${workerToken}`,
        "content-type": input.mimeType,
      },
      body: Uint8Array.from(input.bytes),
      signal: controller.signal,
    });
    responseText = await readLimitedWorkerResponse(response);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Document processing timed out");
    throw new Error("Isolated document processing failed", { cause: error });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Document was rejected by the isolated worker (${response.status})`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error("Document worker returned invalid JSON");
  }
  const result = WorkerResultSchema.parse(payload);
  const localHash = await sha256Hex(input.bytes);
  if (
    result.sha256 !== localHash ||
    result.mime_type !== input.mimeType ||
    result.size_bytes !== input.bytes.byteLength
  ) {
    throw new Error("Document worker response does not match the uploaded object");
  }
  if (result.mime_type.endsWith("document") && !result.extracted_text?.trim()) {
    throw new Error("DOCX contains no readable text");
  }
  return result;
}
