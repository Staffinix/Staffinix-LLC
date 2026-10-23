import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { PipelineTracker } from "@/components/submissions/pipeline-tracker";

export const Route = createFileRoute("/_authenticated/submissions/board")({
  head: () => ({ meta: [{ title: "Pipeline Tracker — Staffinix" }] }),
  component: PipelineTrackerPage,
});

function PipelineTrackerPage() {
  return (
    <>
      <AppTopbar title="Pipeline Tracker" />
      <main className="flex-1 space-y-5 p-6 md:p-8">
        <PageHeader
          title="Pipeline Tracker"
          description="Live submission records for the authenticated tenant."
        />
        <PipelineTracker />
      </main>
    </>
  );
}
