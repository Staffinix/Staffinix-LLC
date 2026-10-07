import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
  UserRound,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCandidate } from "@/lib/candidates.functions";
import { getRequirement } from "@/lib/requirements.functions";
import {
  approveFactPreservingResume,
  generateFactPreservingResume,
  verifyCandidateResume,
} from "@/lib/tailoring.functions";

type TailoringSearch = { reqId?: string; candidateId?: string; tab?: string };

export const Route = createFileRoute("/_authenticated/tailoring")({
  validateSearch: (search: Record<string, unknown>): TailoringSearch => ({
    reqId: typeof search.reqId === "string" ? search.reqId : undefined,
    candidateId: typeof search.candidateId === "string" ? search.candidateId : undefined,
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  head: () => ({ meta: [{ title: "Resume Tailoring — Staffinix" }] }),
  component: TailoringPage,
});

function TailoringPage() {
  const { reqId, candidateId } = Route.useSearch();
  const queryClient = useQueryClient();
  const [sourceConfirmed, setSourceConfirmed] = useState(false);
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const getCandidateFn = useServerFn(getCandidate);
  const getRequirementFn = useServerFn(getRequirement);
  const verifyResumeFn = useServerFn(verifyCandidateResume);
  const generateResumeFn = useServerFn(generateFactPreservingResume);
  const approveResumeFn = useServerFn(approveFactPreservingResume);

  const candidateQuery = useQuery({
    queryKey: ["candidate", candidateId],
    queryFn: () => getCandidateFn({ data: { id: candidateId! } }),
    enabled: Boolean(candidateId),
  });
  const requirementQuery = useQuery({
    queryKey: ["requirement", reqId],
    queryFn: () => getRequirementFn({ data: { id: reqId! } }),
    enabled: Boolean(reqId),
  });

  const verifyMutation = useMutation({
    mutationFn: (resumeId: string) =>
      verifyResumeFn({
        data: {
          candidate_id: candidateId!,
          resume_id: resumeId,
          confirmed_against_source: true,
        },
      }),
    onSuccess: async () => {
      setSourceConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      toast.success("Source resume verified");
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      generateResumeFn({
        data: { candidate_id: candidateId!, requirement_id: reqId! },
      }),
    onSuccess: async () => {
      setApprovalConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      toast.success("Fact-validated draft saved");
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const approveMutation = useMutation({
    mutationFn: (versionId: string) =>
      approveResumeFn({ data: { version_id: versionId, confirmed_reviewed: true } }),
    onSuccess: async () => {
      setApprovalConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      toast.success("Tailored resume approved");
    },
    onError: (error) => toast.error((error as Error).message),
  });

  if (!reqId || !candidateId) {
    return (
      <TailoringState
        title="Select a candidate and requisition"
        message="Resume tailoring requires real candidate and requisition records. Select both from the matching workspace."
      />
    );
  }

  if (candidateQuery.isLoading || requirementQuery.isLoading) {
    return (
      <TailoringState
        title="Loading records…"
        message="Loading candidate and requisition data."
        loading
      />
    );
  }

  if (
    candidateQuery.isError ||
    requirementQuery.isError ||
    !candidateQuery.data ||
    !requirementQuery.data
  ) {
    return (
      <TailoringState
        title="Tailoring data could not be loaded"
        message="The candidate or requisition is unavailable. No resume or submission was generated."
        error
      />
    );
  }

  const candidate = candidateQuery.data;
  const requirement = requirementQuery.data;
  const candidateName = `${candidate.first_name} ${candidate.last_name}`;
  const verifiedResume = candidate.resumes.find(
    (resume) => resume.verification_status === "verified" && resume.extracted_text?.trim(),
  );
  const reviewableResume = candidate.resumes.find((resume) => resume.extracted_text?.trim());
  const savedVersion = candidate.versions.find(
    (version) => version.requirement_id === requirement.id,
  );
  const version = approveMutation.data ?? generateMutation.data ?? savedVersion;
  const validation = version?.claim_validation as
    { valid?: boolean; claim_count?: number; validation_mode?: string } | undefined;

  return (
    <>
      <AppTopbar title="Resume Tailoring" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
          <Link to="/matching" search={{ reqId: requirement.id, candidateId: candidate.id }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to matching
          </Link>
        </Button>

        <PageHeader
          title={`Resume tailoring: ${candidateName}`}
          description={`Target requisition: ${requirement.title}`}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserRound className="h-4 w-4 text-primary" /> Candidate record
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="font-semibold">{candidateName}</p>
              <p className="text-muted-foreground">
                {[candidate.current_title, candidate.location].filter(Boolean).join(" · ") ||
                  "No role or location recorded"}
              </p>
              <div className="flex flex-wrap gap-2">
                {candidate.skills.map((item) => (
                  <Badge key={item.id} variant="outline">
                    {item.skill}
                  </Badge>
                ))}
                {candidate.skills.length === 0 && (
                  <span className="text-muted-foreground">No skills recorded.</span>
                )}
              </div>
              <p className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4" /> {candidate.resumes.length} uploaded resume
                {candidate.resumes.length === 1 ? "" : "s"}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm">Requisition record</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="font-semibold">{requirement.title}</p>
              <p className="text-muted-foreground">
                {[requirement.client_name, requirement.location].filter(Boolean).join(" · ") ||
                  "No client or location recorded"}
              </p>
              <div className="flex flex-wrap gap-2">
                {requirement.skills.map((item) => (
                  <Badge key={item.id} variant={item.is_mandatory ? "default" : "outline"}>
                    {item.skill}
                  </Badge>
                ))}
                {requirement.skills.length === 0 && (
                  <span className="text-muted-foreground">No required skills recorded.</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-primary" /> 1. Verify the source
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {verifiedResume ? (
              <div className="flex items-start gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="space-y-3">
                  <p className="font-semibold">{verifiedResume.file_name}</p>
                  <p className="text-muted-foreground">
                    Human-verified source. Any document or extracted-text change automatically
                    invalidates this verification.
                  </p>
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={sourceConfirmed}
                      onChange={(event) => setSourceConfirmed(event.target.checked)}
                    />
                    I rechecked the current structured facts against this resume.
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!sourceConfirmed || verifyMutation.isPending}
                    onClick={() => verifyMutation.mutate(verifiedResume.id)}
                  >
                    {verifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Renew source verification
                  </Button>
                </div>
              </div>
            ) : reviewableResume ? (
              <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-semibold">Review {reviewableResume.file_name}</p>
                    <p className="text-muted-foreground">
                      Confirm the candidate fields, employment, education, certifications, projects,
                      skills, dates, visa status, and availability against this source.
                    </p>
                  </div>
                </div>
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={sourceConfirmed}
                    onChange={(event) => setSourceConfirmed(event.target.checked)}
                  />
                  I reviewed the structured candidate facts against the uploaded resume and found no
                  unsupported claims.
                </label>
                <Button
                  size="sm"
                  disabled={!sourceConfirmed || verifyMutation.isPending}
                  onClick={() => verifyMutation.mutate(reviewableResume.id)}
                >
                  {verifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Mark source as verified
                </Button>
              </div>
            ) : (
              <div role="alert" className="rounded-md border border-destructive/30 p-4">
                <p className="font-semibold">No reviewable source resume</p>
                <p className="text-muted-foreground">
                  Upload a resume with extractable text. Tailoring remains disabled and no output is
                  generated.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wand2 className="h-4 w-4 text-primary" /> 2. Select and validate facts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              AI can only select and order existing database record IDs. The server renders their
              stored values verbatim and rejects unknown or duplicated IDs before saving.
            </p>
            <Button
              disabled={!verifiedResume || generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              {generateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              Generate fact-preserving draft
            </Button>

            {version && (
              <div className="space-y-4 rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">Version {version.version_no}</p>
                    <p className="text-xs text-muted-foreground">
                      Source hash {version.source_hash?.slice(0, 12)}…
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={validation?.valid ? "default" : "destructive"}>
                      {validation?.valid
                        ? `${validation.claim_count ?? 0} facts validated`
                        : "Validation failed"}
                    </Badge>
                    <Badge variant="outline">{version.status}</Badge>
                  </div>
                </div>
                <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs leading-5">
                  {version.tailored_content}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        {version && validation?.valid && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary" /> 3. Human approval
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {version.status === "approved" ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <p className="font-semibold text-emerald-700">Approved for submission use</p>
                  <p className="text-muted-foreground">
                    The source snapshot and rendered claims are immutable. Changed source facts
                    require a new version.
                  </p>
                </div>
              ) : (
                <>
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={approvalConfirmed}
                      onChange={(event) => setApprovalConfirmed(event.target.checked)}
                    />
                    I reviewed the rendered resume and approve every claim for use in this
                    requisition.
                  </label>
                  <Button
                    disabled={!approvalConfirmed || approveMutation.isPending}
                    onClick={() => approveMutation.mutate(version.id)}
                  >
                    {approveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Approve tailored resume
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}

function TailoringState({
  title,
  message,
  loading = false,
  error = false,
}: {
  title: string;
  message: string;
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <>
      <AppTopbar title="Resume Tailoring" />
      <main className="flex-1 p-6 md:p-8">
        <Card role={error ? "alert" : "status"} className="border-border bg-card">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            {loading ? (
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            ) : (
              <AlertTriangle
                className={error ? "h-7 w-7 text-destructive" : "h-7 w-7 text-amber-600"}
              />
            )}
            <p className="font-semibold">{title}</p>
            <p className="max-w-lg text-sm text-muted-foreground">{message}</p>
            {!loading && (
              <Button asChild size="sm">
                <Link to="/matching">Go to matching</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
