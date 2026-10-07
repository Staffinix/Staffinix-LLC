import { defineTask } from "nitro/task";
import { processCandidateEmbeddingJobs } from "@/lib/embedding-service.server";

export default defineTask({
  meta: {
    name: "candidate-embeddings",
    description: "Generate embeddings for committed candidate records",
  },
  async run() {
    const result = await processCandidateEmbeddingJobs(10);
    return { result };
  },
});
