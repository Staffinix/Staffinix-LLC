import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, CircleAlert, CircleCheck, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { matchCandidatesForRequirement } from "@/lib/matching.functions";

type MatchingSearch = { reqId?: string; candidateId?: string };

export const Route = createFileRoute("/_authenticated/matching")({
  validateSearch: (search: Record<string, unknown>): MatchingSearch => ({
    reqId: typeof search.reqId === "string" ? search.reqId : undefined,
    candidateId: typeof search.candidateId === "string" ? search.candidateId : undefined,
  }),
  head: () => ({ meta: [{ title: "Candidate Matching — Staffinix" }] }),
  component: MatchingPage,
});

function MatchingPage() {
  const { reqId, candidateId } = Route.useSearch();
  const [visaFilter, setVisaFilter] = useState("all");
  const matchFn = useServerFn(matchCandidatesForRequirement);
  const matchQuery = useQuery({
    queryKey: ["match-candidates", reqId, candidateId],
    queryFn: () =>
      matchFn({ data: { requirement_id: reqId!, candidate_id: candidateId, limit: 25 } }),
    enabled: Boolean(reqId),
  });

  const rows = (matchQuery.data?.rows ?? []).filter(
    (row) => visaFilter === "all" || row.candidate.visa_status === visaFilter,
  );
  const visaOptions = Array.from(
    new Set((matchQuery.data?.rows ?? []).map((row) => row.candidate.visa_status).filter(Boolean)),
  ) as string[];

  async function refreshMatches() {
    const result = await matchQuery.refetch();
    if (result.isError) toast.error("Matches could not be refreshed.");
    else toast.success("Matches refreshed.");
  }

  return (
    <>
      <AppTopbar title="Candidate Matching" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
            <Link to="/requirements">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Requisitions
            </Link>
          </Button>
          {reqId && (
            <Button
              variant="outline"
              size="sm"
              onClick={refreshMatches}
              disabled={matchQuery.isFetching}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
            </Button>
          )}
        </div>

        <PageHeader
          title="Candidate Matching"
          description="Database-backed candidate matches for the selected requisition."
        />

        {!reqId ? (
          <StateCard message="Select a requisition before running candidate matching." />
        ) : matchQuery.isLoading ? (
          <StateCard loading message="Loading candidate matches…" />
        ) : matchQuery.isError ? (
          <StateCard error message="Candidate matches could not be loaded." />
        ) : (
          <>
            <Card className="border-border bg-card">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Requisition</p>
                  <p className="font-semibold">{matchQuery.data?.requirement.title}</p>
                </div>
                <Select value={visaFilter} onValueChange={setVisaFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Visa filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All visa types</SelectItem>
                    {visaOptions.map((visa) => (
                      <SelectItem key={visa} value={visa}>
                        {visa}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-4 text-xs text-muted-foreground">
                Scores are decision support only. Recorded hard constraints are evaluated
                deterministically, but every candidate still requires recruiter review before any
                hiring or rejection action.
              </CardContent>
            </Card>

            <div className="grid gap-4">
              {rows.map((row) => (
                <Card key={row.candidate.id} className="border-border bg-card">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-base">
                          {row.candidate.first_name} {row.candidate.last_name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {row.candidate.current_title || "Role not recorded"}
                        </p>
                      </div>
                      <Badge>
                        <Sparkles className="mr-1 h-3 w-3" /> {row.scores.overall}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Badge
                      variant="outline"
                      className={
                        row.hard_constraints.passed
                          ? "border-emerald-500/30 text-emerald-600"
                          : "border-amber-500/30 text-amber-600"
                      }
                    >
                      {row.hard_constraints.passed ? (
                        <CircleCheck className="mr-1 h-3 w-3" />
                      ) : (
                        <CircleAlert className="mr-1 h-3 w-3" />
                      )}
                      {row.hard_constraints.passed
                        ? "Recorded hard constraints met"
                        : "Needs human review"}
                    </Badge>
                    {row.matched_skills.map((skill) => (
                      <Badge key={skill} variant="outline">
                        {skill}
                      </Badge>
                    ))}
                    {!row.hard_constraints.passed && (
                      <p className="w-full text-xs text-muted-foreground">
                        {row.hard_constraints.reasons.join(" · ")}
                      </p>
                    )}
                    <Button asChild variant="ghost" size="sm" className="ml-auto">
                      <Link to="/candidates/$id" params={{ id: row.candidate.id }}>
                        View candidate
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {rows.length === 0 && <StateCard message="No matching candidates were found." />}
            </div>
          </>
        )}
      </main>
    </>
  );
}

function StateCard({
  message,
  loading = false,
  error = false,
}: {
  message: string;
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <Card role={error ? "alert" : "status"} className="border-border bg-card">
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
  );
}
