import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { CopilotPanel } from "@/components/ai/copilot-drawer";

export const Route = createFileRoute("/_authenticated/copilot")({
  head: () => ({
    meta: [
      { title: "AI Copilot — Staffinix" },
      {
        name: "description",
        content: "Read-only RAG assistant grounded in your candidates, requisitions and pipeline.",
      },
      { property: "og:title", content: "AI Copilot — Staffinix" },
      {
        property: "og:description",
        content: "Ask grounded questions about your recruiting workspace — no invented facts.",
      },
    ],
  }),
  component: CopilotPage,
});

function CopilotPage() {
  return (
    <>
      <AppTopbar title="AI Copilot" />
      <main className="flex min-h-0 flex-1 flex-col p-6 md:p-8">
        <PageHeader
          title="AI Copilot"
          description="Grounded over your live workspace — read-only tools, no fabricated claims."
        />
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
          <CopilotPanel />
        </div>
      </main>
    </>
  );
}
