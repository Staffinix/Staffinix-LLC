import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { AppTopbar } from "@/components/app-shell/topbar";
import { CandidateForm } from "@/components/candidates/candidate-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCandidate } from "@/lib/candidates.functions";

export const Route = createFileRoute("/_authenticated/candidates/$id/edit")({
  head: () => ({ meta: [{ title: "Edit Candidate — Staffinix" }] }),
  component: EditCandidatePage,
});

function EditCandidatePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const getCandidateFn = useServerFn(getCandidate);
  const candidateQuery = useQuery({
    queryKey: ["candidate", id],
    queryFn: () => getCandidateFn({ data: { id } }),
  });

  if (candidateQuery.isLoading) return <EditState message="Loading candidate…" loading />;
  if (candidateQuery.isError || !candidateQuery.data) {
    return <EditState message="Candidate data could not be loaded." error />;
  }

  const candidate = candidateQuery.data;
  return (
    <>
      <AppTopbar title="Edit Candidate" />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center space-y-6 p-6 md:p-8">
        <div className="w-full">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/candidates/$id" params={{ id }}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Candidate
            </Link>
          </Button>
        </div>
        <PageHeader
          title={`Edit ${candidate.first_name} ${candidate.last_name}`}
          description="Update candidate details while preserving the existing candidate record."
        />
        <div className="w-full">
          <CandidateForm
            mode="edit"
            initialData={candidate}
            onSaved={(candidateId) =>
              navigate({ to: "/candidates/$id", params: { id: candidateId }, replace: true })
            }
          />
        </div>
      </main>
    </>
  );
}

function EditState({
  message,
  loading,
  error,
}: {
  message: string;
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <>
      <AppTopbar title="Edit Candidate" />
      <main className="flex-1 p-6 md:p-8">
        <Card role={error ? "alert" : "status"}>
          <CardContent
            className={
              error
                ? "p-10 text-center text-sm text-destructive"
                : "p-10 text-center text-sm text-muted-foreground"
            }
          >
            {loading && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}
            {message}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
