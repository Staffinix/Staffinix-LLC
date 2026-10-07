import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, "src");
const adminModule = "src/integrations/supabase/client.server.ts";
const keySafetyModule = "src/integrations/supabase/api-key-safety.ts";
const embeddingServiceModule = "src/lib/embedding-service.server.ts";
const failures = [];

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const sourceFiles = filesUnder(sourceRoot).filter(
  (file) => [".ts", ".tsx"].includes(extname(file)) && !file.endsWith(".test.ts"),
);
for (const file of sourceFiles) {
  const path = relative(root, file).replaceAll("\\", "/");
  const source = readFileSync(file, "utf8");

  if (/VITE_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE)/.test(source)) {
    failures.push(`${path}: privileged key must never use a VITE_ variable`);
  }
  if (
    path !== adminModule &&
    path !== keySafetyModule &&
    /SUPABASE_(?:SECRET_KEYS?|SERVICE_ROLE_KEY)|sb_secret_/.test(source)
  ) {
    failures.push(`${path}: privileged key reference outside the server-only client`);
  }
  if (
    /return\s+(?:supabaseAdmin|serviceClient)|JSON\.stringify\s*\(\s*(?:supabaseAdmin|serviceClient)/.test(
      source,
    )
  ) {
    failures.push(`${path}: privileged client is returned or serialized`);
  }
  if (
    source.includes("integrations/supabase/client.server") &&
    !path.endsWith(".server.ts") &&
    !path.endsWith(".functions.ts")
  ) {
    failures.push(`${path}: browser-capable module imports the privileged client`);
  }

  const mentionsEmbeddingTable = /["'](?:candidate|requirement)_embeddings["']/.test(source);
  const writesEmbeddingTable =
    mentionsEmbeddingTable && /\.(?:insert|upsert|update|delete)\s*\(/.test(source);
  if (writesEmbeddingTable && path !== embeddingServiceModule) {
    failures.push(`${path}: embedding writes must use the authorized embedding service`);
  }
  if (
    mentionsEmbeddingTable &&
    source.includes("supabaseAdmin") &&
    path !== embeddingServiceModule
  ) {
    failures.push(`${path}: privileged embedding access must stay inside the embedding service`);
  }
}

const embeddingServiceSource = readFileSync(join(root, embeddingServiceModule), "utf8");
for (const requiredBoundary of [
  "authorizeCandidateAccess",
  "authorizeRequirementAccess",
  "writeCandidateEmbedding",
  "writeRequirementEmbedding",
  "candidateAccessGrants.has(access)",
  "requirementAccessGrants.has(access)",
]) {
  if (!embeddingServiceSource.includes(requiredBoundary)) {
    failures.push(`${embeddingServiceModule}: missing embedding boundary ${requiredBoundary}`);
  }
}
if (
  !/const \{ data: written, error: writeError \} = await supabaseAdmin[\s\S]+?if \(writeError\)/.test(
    embeddingServiceSource,
  )
) {
  failures.push(
    `${embeddingServiceModule}: privileged embedding upserts must check returned errors`,
  );
}

const adminSource = readFileSync(join(root, adminModule), "utf8");
if (
  !adminSource.includes('from "@supabase/server/core"') ||
  !adminSource.includes("createAdminClient")
) {
  failures.push(`${adminModule}: must use @supabase/server createAdminClient`);
}
if (/SUPABASE_SERVICE_ROLE_KEY|createClient\s*</.test(adminSource)) {
  failures.push(`${adminModule}: legacy service-role client construction is forbidden`);
}
if (/console\.(?:log|info|warn|error|debug)/.test(adminSource)) {
  failures.push(`${adminModule}: privileged client module must not log`);
}

const publicDir = join(root, ".output/public");
if (process.argv.includes("--bundle")) {
  if (!existsSync(publicDir) || !statSync(publicDir).isDirectory()) {
    failures.push(".output/public: production client bundle is missing");
  } else {
    const forbiddenBundleText = [
      "SERVICE_ROLE_CLIENT_BUNDLE_CANARY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SECRET_KEYS",
      "client.server.ts",
    ];
    for (const file of filesUnder(publicDir)) {
      if (!/[.](?:js|mjs|cjs|map|html|json)$/.test(file)) continue;
      const source = readFileSync(file, "utf8");
      for (const token of forbiddenBundleText) {
        if (source.includes(token)) {
          failures.push(`${relative(root, file)}: client bundle contains ${token}`);
        }
      }
    }
  }
}

if (failures.length) {
  console.error("Service-role boundary check failed:\n" + failures.join("\n"));
  process.exit(1);
}

console.log("Service-role boundary check passed.");
