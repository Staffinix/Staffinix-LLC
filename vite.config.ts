// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";

const fixturesDisabled = fileURLToPath(
  new URL("./src/lib/production-fixtures-disabled.ts", import.meta.url),
);
const candidateEmbeddingTask = fileURLToPath(
  new URL("./tasks/candidate-embeddings.ts", import.meta.url),
);
const emailSyncTask = fileURLToPath(new URL("./tasks/email-sync.ts", import.meta.url));

export default defineConfig({
  nitro: {
    experimental: { tasks: true },
    tasks: {
      "candidate-embeddings": {
        handler: candidateEmbeddingTask,
        description: "Generate embeddings for committed candidate records",
      },
      "email-sync": {
        handler: emailSyncTask,
        description: "Synchronize connected L4 recruiter email accounts",
      },
    },
    scheduledTasks: {
      // Vercel Hobby permits cron jobs to run at most once per day.
      "0 0 * * *": "candidate-embeddings",
      "30 0 * * *": "email-sync",
    },
  } as unknown as { preset?: string },
  vite: {
    resolve: {
      alias: [
        { find: "@/lib/master-mock-dataset", replacement: fixturesDisabled },
        { find: "@/lib/tailoring-mock", replacement: fixturesDisabled },
      ],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    serverFns: {
      disableCsrfMiddlewareWarning: true,
    },
  },
});
