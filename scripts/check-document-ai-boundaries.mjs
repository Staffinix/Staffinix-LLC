import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const codeExtensions = /\.(?:[cm]?[jt]sx?)$/;

function codeFilesUnder(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) files.push(...codeFilesUnder(path));
    else if (codeExtensions.test(entry)) files.push(path);
  }
  return files;
}

const applicationCode = codeFilesUnder(resolve(root, "src"));
for (const file of applicationCode) {
  const source = readFileSync(file, "utf8");
  assert.doesNotMatch(
    source,
    /(?:from\s+|require\(|import\()["']mammoth(?:\/mammoth\.browser)?["']?/,
    `${file} imports Mammoth outside the isolated worker`,
  );
  assert.equal(source.includes("convertToHtml"), false, `${file} converts DOCX into unsafe HTML`);
}

const unsafeHtmlFiles = applicationCode
  .filter((file) => readFileSync(file, "utf8").includes("dangerouslySetInnerHTML"))
  .map((file) => file.slice(root.length + 1).replaceAll("\\", "/"));
assert.deepEqual(
  unsafeHtmlFiles,
  ["src/components/ui/chart.tsx"],
  "New dangerouslySetInnerHTML usage requires an explicit security review and sanitizer",
);
const chartSource = readFileSync(resolve(root, "src/components/ui/chart.tsx"), "utf8");
assert.doesNotMatch(
  chartSource,
  /mammoth|docx|resume|extracted_text/i,
  "The chart HTML allowlist must never render document-derived content",
);
const productionFiles = [
  "src/lib/candidates.functions.ts",
  "src/lib/requirements.functions.ts",
  "src/lib/matching.functions.ts",
  "src/lib/tailoring.functions.ts",
  "src/lib/embedding-service.server.ts",
  "src/lib/copilot.functions.ts",
];

for (const file of productionFiles) {
  const source = readFileSync(resolve(root, file), "utf8");
  assert.equal(
    source.includes('fetch("https://ai.gateway.lovable.dev'),
    false,
    `${file} bypasses the timeout/output-validation AI gateway boundary`,
  );
  assert.equal(source.includes("pdf_base64"), false, `${file} accepts inline PDF base64`);
}

const candidates = readFileSync(resolve(root, "src/lib/candidates.functions.ts"), "utf8");
const requirements = readFileSync(resolve(root, "src/lib/requirements.functions.ts"), "utf8");
const copilot = readFileSync(resolve(root, "src/lib/copilot.functions.ts"), "utf8");
const rag = readFileSync(resolve(root, "src/lib/rag.server.ts"), "utf8");
for (const [name, source] of [
  ["candidate parser", candidates],
  ["requirement parser", requirements],
]) {
  assert.match(source, /processDocumentInIsolatedWorker/, `${name} bypasses isolated processing`);
  assert.match(
    source,
    /UNTRUSTED_DOCUMENT_SYSTEM_RULES/,
    `${name} lacks injection-resistant rules`,
  );
  assert.match(source, /requestStructuredAiOutput/, `${name} lacks schema-bound AI output`);
}

assert.match(
  copilot,
  /requireDashboardAccess/,
  "Copilot lacks authenticated, feature-scoped dashboard access",
);
const authMiddleware = readFileSync(
  resolve(root, "src/integrations/supabase/auth-middleware.ts"),
  "utf8",
);
assert.match(
  authMiddleware,
  /requireDashboardAccess\s*=\s*requireFeatureAccess\("dashboard"\)/,
  "Dashboard access middleware is not bound to the dashboard feature",
);
assert.match(
  authMiddleware,
  /requireFeatureAccess[\s\S]*\.middleware\(\[requireSupabaseAuth\]\)/,
  "Feature access middleware no longer authenticates callers",
);
assert.match(copilot, /UNTRUSTED_DOCUMENT_SYSTEM_RULES/, "Copilot lacks injection-resistant rules");
assert.match(copilot, /requestStructuredAiOutput/, "Copilot lacks schema-bound AI output");
assert.match(copilot, /Never make or recommend automatic hiring\/rejection decisions/);
assert.match(rag, /next_page_offset/, "Qdrant synchronization does not paginate scroll results");
assert.match(rag, /tenantFilter\(tenantId\)/, "Qdrant operations lack a verified tenant filter");
assert.doesNotMatch(
  rag,
  /limit:\s*2_000/,
  "Qdrant synchronization must not assume a fixed scan limit is complete",
);

const worker = readFileSync(resolve(root, "workers/document-processor/server.mjs"), "utf8");
const documentJob = readFileSync(
  resolve(root, "workers/document-processor/document-job.mjs"),
  "utf8",
);
assert.match(documentJob, /mammoth\.extractRawText/, "Mammoth must use raw-text extraction");
assert.equal(
  documentJob.includes("convertToHtml"),
  false,
  "Mammoth HTML conversion must never be called",
);
assert.equal(
  documentJob.includes("externalFileAccess: true"),
  false,
  "Mammoth external-file access must remain disabled",
);
assert.match(worker, /CLAMAV_HOST/, "document worker does not require malware scanning");
assert.match(worker, /resourceLimits/, "document worker lacks a memory limit");
assert.match(worker, /worker\.terminate/, "document worker lacks a hard job termination path");
assert.match(worker, /MAX_BODY_BYTES/, "document worker lacks a hard body limit");

const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
assert.equal(packageJson.dependencies.mammoth, "1.12.1", "Mammoth must be exactly pinned");

console.log("Document and AI processing boundary checks passed.");
