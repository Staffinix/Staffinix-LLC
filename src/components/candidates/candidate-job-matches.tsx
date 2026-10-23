import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { matchRequirementsForCandidate } from "@/features/ai-matching/matching.functions";

export function CandidateJobMatches({ candidateId }: { candidateId: string }) {
  const match = useServerFn(matchRequirementsForCandidate);
  const query = useQuery({
    queryKey: ["candidate-job-matches", candidateId],
    queryFn: () => match({ data: { candidate_id: candidateId, limit: 50 } }),
    retry: false,
  });
  const candidate = query.data?.candidate;
  return (
    <>
      <AppTopbar title="Candidate Job Matching" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <div className="flex flex-wrap justify-between gap-3">
          <Button asChild variant="outline">
            <Link to="/candidates">Back to Candidates</Link>
          </Button>
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh matches
          </Button>
        </div>
        <PageHeader
          title={
            candidate
              ? `Jobs for ${candidate.first_name} ${candidate.last_name}`
              : "Candidate Job Matching"
          }
          description="Open jobs ranked using recorded skills, experience, work authorization, and location. Preliminary matches require recruiter review; they do not guarantee eligibility."
        />
        {query.isPending && <p role="status">Finding matching jobs…</p>}
        {query.isError && (
          <p role="alert" className="text-destructive">
            {query.error instanceof Error ? query.error.message : "Unable to load job matches."}
          </p>
        )}
        {query.data && (
          <p className="text-sm text-muted-foreground">
            Showing up to 50 ranked jobs from up to 150 accessible open requisitions. No submission
            is created.
          </p>
        )}
        {query.data?.rows.length === 0 && <p>No accessible open jobs are available to match.</p>}
        <div className="grid gap-4">
          {query.data?.rows.map((row) => (
            <Card key={row.requirement.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-semibold">{row.requirement.title}</h2>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{row.scores.overall}% match</Badge>
                    <Badge variant="outline">
                      {row.hard_constraints.passed ? "Meets recorded checks" : "Eligibility gaps"}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {row.requirement.location || "Location not recorded"} ·{" "}
                  {row.requirement.work_mode || "Work mode not recorded"}
                </p>
                <p className="text-sm">
                  Matched skills: {row.matched_skills.join(", ") || "None recorded"}
                </p>
                <p className="text-sm">
                  Missing skills: {row.missing_skills.join(", ") || "None identified"}
                </p>
                {row.hard_constraints.reasons.length > 0 && (
                  <ul className="list-disc pl-5 text-sm text-muted-foreground">
                    {row.hard_constraints.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
                <Button asChild variant="outline" size="sm">
                  <Link to="/requirements/$id" params={{ id: row.requirement.id }}>
                    Review Requisition &amp; JD
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
