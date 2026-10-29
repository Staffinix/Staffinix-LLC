import { defineTask } from "nitro/task";
import { processCandidateEmbeddingJobs } from "@/lib/embedding-service.server";

import { processResumeStorageJobs } from "@/lib/resume-storage-jobs.server";

export default defineTask({
  meta: {
    name: "candidate-embeddings",
    description: "Generate embeddings for committed candidate records",
  },
  async run() {
    let storageCompleted = 0;
    for (let batch = 0; batch < 10; batch++) {
      const storage = await processResumeStorageJobs();
      storageCompleted += storage.completed;
      if (storage.completed < 5) break;
    }
    const result = await processCandidateEmbeddingJobs(10);
    return { result: { ...result, storageCompleted } };
  },
});
