import { answerWithRag, getRagHealth, type RagDocument } from "../src/lib/rag.server.ts";

const tenantId = `rag-smoke-${Date.now()}`;
const qdrantUrl = (process.env.QDRANT_URL?.trim() || "http://127.0.0.1:6333").replace(/\/$/, "");
const collection = process.env.QDRANT_COLLECTION?.trim() || "staffinix_knowledge";

async function removeSmokePoints() {
  await fetch(`${qdrantUrl}/collections/${collection}/points/delete?wait=true`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filter: { must: [{ key: "tenant_id", match: { value: tenantId } }] },
    }),
  }).catch(() => undefined);
}

const documents: RagDocument[] = [
  {
    documentId: "candidate-ava-patel",
    sourceKey: "candidate-ava-patel",
    sourceLabel: "Candidate: Ava Patel",
    sourcePath: "/candidates/candidate-ava-patel",
    sourceType: "candidate",
    content:
      "Ava Patel is a senior TypeScript engineer with seven years of experience. She has production experience with React, Node.js, PostgreSQL, and Qdrant. She is ready to relocate to Bengaluru.",
  },
  {
    documentId: "candidate-ben-lee",
    sourceKey: "candidate-ben-lee",
    sourceLabel: "Candidate: Ben Lee",
    sourcePath: "/candidates/candidate-ben-lee",
    sourceType: "candidate",
    content:
      "Ben Lee is a finance analyst experienced with forecasting and Excel. He prefers opportunities in Mumbai and is not seeking software engineering roles.",
  },
];

try {
  const health = await getRagHealth();
  if (!health.qdrant || !health.ollama) {
    throw new Error(`RAG services are unhealthy: ${JSON.stringify(health)}`);
  }

  const result = await answerWithRag({
    tenantId,
    question: "Which candidate has Qdrant and TypeScript experience?",
    documents,
    history: [],
  });

  if (
    result.mode !== "rag" ||
    !result.answer.toLowerCase().includes("ava") ||
    result.chunks.length === 0
  ) {
    throw new Error(`Unexpected RAG response: ${JSON.stringify(result)}`);
  }

  console.log(
    JSON.stringify(
      {
        status: "passed",
        mode: result.mode,
        indexedChunks: result.indexedChunks,
        retrievedChunks: result.chunks.length,
        topSource: result.chunks[0]?.sourceLabel,
        answer: result.answer,
      },
      null,
      2,
    ),
  );
} finally {
  await removeSmokePoints();
}
