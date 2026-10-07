import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { AppTopbar } from "@/components/app-shell/topbar";
import { CandidateForm } from "@/components/candidates/candidate-form";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/candidates/new")({
  head: () => ({ meta: [{ title: "Add New Candidate — Staffinix" }] }),
  component: NewCandidatePage,
});

function NewCandidatePage() {
  const navigate = useNavigate();

  return (
    <>
      <AppTopbar title="Add New Candidate" />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center space-y-6 p-6 md:p-8">
        <div className="w-full">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/candidates">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Bench Candidates
            </Link>
          </Button>
        </div>
        <PageHeader
          title="Add New Candidate"
          description="Fill in candidate details to add them to the Bench Candidates repository."
        />
        <div className="w-full">
          <CandidateForm
            mode="create"
            onSaved={(id) => navigate({ to: "/candidates/$id", params: { id } })}
          />
        </div>
      </main>
    </>
  );
}
