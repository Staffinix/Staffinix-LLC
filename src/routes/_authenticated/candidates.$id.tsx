import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Briefcase,
  FileText,
  GraduationCap,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Send,
  UserRound,
} from "lucide-react";

import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCandidate } from "@/lib/candidates.functions";
import {
  assignCandidatesToRecruiter,
  getCandidateManagement,
  listEligibleL4Recruiters,
  updateCandidateStatus,
} from "@/lib/candidate-management.functions";
import { CANDIDATE_STATUS_LABEL } from "@/lib/candidates-constants";
import { useRoleLevel } from "@/hooks/use-role-level";
import { RecruiterPicker } from "@/components/candidates/recruiter-picker";

export const Route = createFileRoute("/_authenticated/candidates/$id")({
  head: () => ({ meta: [{ title: "Candidate Profile — Staffinix" }] }),
  component: CandidateDetailPage,
});

function CandidateDetailPage() {
  const { id } = Route.useParams();
  const { level } = useRoleLevel();
  const isL2 = level === "L2";
  const isL4 = level === "L4";
  const queryClient = useQueryClient();
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [recruiterId, setRecruiterId] = useState("");
  const [statusDraft, setStatusDraft] = useState("");
  const getCandidateFn = useServerFn(getCandidate);
  const candidateQuery = useQuery({
    queryKey: ["candidate", id],
    queryFn: () => getCandidateFn({ data: { id } }),
  });
  const managementFn = useServerFn(getCandidateManagement);
  const managementQuery = useQuery({
    queryKey: ["candidate-management", id],
    queryFn: () => managementFn({ data: { candidateId: id } }),
  });
  const recruitersFn = useServerFn(listEligibleL4Recruiters);
  const recruitersQuery = useQuery({
    queryKey: ["eligible-l4-recruiters"],
    queryFn: () => recruitersFn(),
    enabled: isL2,
  });
  const assignFn = useServerFn(assignCandidatesToRecruiter);
  const assignmentMutation = useMutation({
    mutationFn: () => assignFn({ data: { candidateIds: [id], recruiterId } }),
    onSuccess: async () => {
      toast.success("Candidate assignment updated.");
      setAssignmentOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["candidate", id] }),
        queryClient.invalidateQueries({ queryKey: ["candidate-management", id] }),
        queryClient.invalidateQueries({ queryKey: ["candidates"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Assignment failed."),
  });
  const updateStatusFn = useServerFn(updateCandidateStatus);
  const statusMutation = useMutation({
    mutationFn: (input: {
      status: "active" | "submitted" | "placed" | "on_hold" | "inactive";
      expectedUpdatedAt: string;
    }) =>
      updateStatusFn({
        data: {
          candidateId: id,
          status: input.status,
          expectedUpdatedAt: input.expectedUpdatedAt,
        },
      }),
    onSuccess: async () => {
      toast.success("Candidate status updated.");
      setStatusDraft("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["candidate", id] }),
        queryClient.invalidateQueries({ queryKey: ["candidate-management", id] }),
        queryClient.invalidateQueries({ queryKey: ["candidates"] }),
      ]);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Status update failed."),
  });

  if (candidateQuery.isLoading) {
    return <CandidateState message="Loading candidate…" loading />;
  }

  if (candidateQuery.isError || !candidateQuery.data) {
    return <CandidateState message="Candidate data could not be loaded." error />;
  }

  const candidate = candidateQuery.data;

  return (
    <>
      <AppTopbar title={`${candidate.first_name} ${candidate.last_name}`} />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
          <Link to="/candidates">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Bench Candidates
          </Link>
        </Button>

        <PageHeader
          title={`${candidate.first_name} ${candidate.last_name}`}
          description={
            [candidate.current_title, candidate.location].filter(Boolean).join(" · ") ||
            "Candidate profile"
          }
          actions={
            <div className="flex flex-wrap gap-2">
              {isL4 && (
                <Button asChild size="sm" className="gap-1.5">
                  <Link to="/submissions/new" search={{ candidate_id: id }}>
                    <Send className="h-3.5 w-3.5" /> Submit Candidate
                  </Link>
                </Button>
              )}
              <Button asChild size="sm" variant={isL4 ? "outline" : "default"} className="gap-1.5">
                <Link to="/candidates/$id/edit" params={{ id }}>
                  <Pencil className="h-3.5 w-3.5" /> Edit Candidate
                </Link>
              </Button>
            </div>
          }
        />

        <Card className="border-border bg-card">
          <CardContent className="grid gap-4 p-6 md:grid-cols-3">
            <Detail label="Current role" value={candidate.current_title} />
            <div className="space-y-1 text-xs">
              <p className="font-semibold uppercase tracking-wider text-muted-foreground">
                Contact
              </p>
              <p className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-primary" /> {candidate.email || "Not recorded"}
              </p>
              <p className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-primary" /> {candidate.phone || "Not recorded"}
              </p>
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" />{" "}
                {candidate.location || "Not recorded"}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{candidate.status}</Badge>
                {candidate.visa_status && (
                  <Badge variant="secondary">{candidate.visa_status}</Badge>
                )}
                {candidate.availability && (
                  <Badge variant="secondary">{candidate.availability.replaceAll("_", " ")}</Badge>
                )}
                {(candidate.marketing_types ?? []).map((type) => (
                  <Badge key={type} variant="outline">
                    {type}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border bg-card">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserRound className="h-4 w-4" /> L4 assignment
              </CardTitle>
              {isL2 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRecruiterId(managementQuery.data?.assignment.recruiter?.id ?? "");
                    setAssignmentOpen(true);
                  }}
                >
                  {managementQuery.data?.assignment.recruiter
                    ? "Change Recruiter"
                    : "Assign to L4 Recruiter"}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {managementQuery.isLoading ? (
                <p className="text-muted-foreground">
                  <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" /> Loading assignment…
                </p>
              ) : (
                <>
                  <p className="font-semibold">
                    {managementQuery.data?.assignment.recruiter?.full_name ||
                      managementQuery.data?.assignment.recruiter?.email ||
                      "Unassigned"}
                  </p>
                  {managementQuery.data?.assignment.assignedAt && (
                    <p className="text-muted-foreground">
                      Assigned{" "}
                      {new Date(managementQuery.data.assignment.assignedAt).toLocaleString()}
                      {managementQuery.data.assignment.assignedBy?.full_name
                        ? ` by ${managementQuery.data.assignment.assignedBy.full_name}`
                        : ""}
                    </p>
                  )}
                  {isL2 && managementQuery.data?.assignmentHistory.length ? (
                    <div className="space-y-2 border-t border-border pt-3">
                      <p className="font-semibold">Recent assignment history</p>
                      {managementQuery.data.assignmentHistory.slice(0, 5).map((entry) => (
                        <div key={entry.id} className="rounded-md border border-border p-2">
                          <p>
                            {entry.previousRecruiter?.full_name || "Unassigned"} →{" "}
                            {entry.newRecruiter?.full_name ||
                              entry.newRecruiter?.email ||
                              "Recruiter"}
                          </p>
                          <p className="text-muted-foreground">
                            {new Date(entry.changed_at).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm">Status & submission activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              {isL2 && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select value={statusDraft || candidate.status} onValueChange={setStatusDraft}>
                    <SelectTrigger aria-label="Candidate status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CANDIDATE_STATUS_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={
                      !statusDraft || statusDraft === candidate.status || statusMutation.isPending
                    }
                    onClick={() =>
                      statusMutation.mutate({
                        status: statusDraft as
                          "active" | "submitted" | "placed" | "on_hold" | "inactive",
                        expectedUpdatedAt: candidate.updated_at,
                      })
                    }
                  >
                    {statusMutation.isPending && (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    )}
                    Update status
                  </Button>
                </div>
              )}
              <div className="space-y-2 border-t border-border pt-3">
                <p className="font-semibold">Submissions</p>
                {(managementQuery.data?.submissions ?? []).slice(0, 5).map((submission) => (
                  <div key={submission.id} className="rounded-md border border-border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="capitalize">
                        {submission.stage.replaceAll("_", " ")}
                      </Badge>
                      <span className="text-muted-foreground">
                        {submission.submitted_at
                          ? new Date(submission.submitted_at).toLocaleString()
                          : "Draft"}
                      </span>
                    </div>
                    {submission.submittedBy && (
                      <p className="mt-1 text-muted-foreground">
                        Submitted by{" "}
                        {submission.submittedBy.full_name || submission.submittedBy.email}
                      </p>
                    )}
                    {submission.candidate_status_at_submission && (
                      <p className="mt-1 text-muted-foreground">
                        Candidate status at submission:{" "}
                        {CANDIDATE_STATUS_LABEL[submission.candidate_status_at_submission]}
                      </p>
                    )}
                  </div>
                ))}
                {!managementQuery.isLoading && !managementQuery.data?.submissions.length && (
                  <EmptyText>No submissions recorded.</EmptyText>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm">Skills</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {candidate.skills.map((item) => (
                <Badge key={item.id} variant="outline">
                  {item.skill}
                </Badge>
              ))}
              {candidate.skills.length === 0 && <EmptyText>No skills recorded.</EmptyText>}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm">Resume files</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {candidate.resumes.map((resume) => (
                <div
                  key={resume.id}
                  className="flex items-center gap-2 rounded-md border border-border p-3 text-xs"
                >
                  <FileText className="h-4 w-4 text-primary" />
                  <span>{resume.file_name}</span>
                </div>
              ))}
              {candidate.resumes.length === 0 && <EmptyText>No resume uploaded.</EmptyText>}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Briefcase className="h-4 w-4" /> Employment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {candidate.employment.map((job) => (
                <div key={job.id} className="rounded-md border border-border p-3 text-xs">
                  <p className="font-semibold">{job.title || "Role not recorded"}</p>
                  <p className="text-muted-foreground">{job.company}</p>
                </div>
              ))}
              {candidate.employment.length === 0 && (
                <EmptyText>No employment history recorded.</EmptyText>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <GraduationCap className="h-4 w-4" /> Education
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {candidate.education.map((education) => (
                <div key={education.id} className="rounded-md border border-border p-3 text-xs">
                  <p className="font-semibold">{education.degree || "Degree not recorded"}</p>
                  <p className="text-muted-foreground">{education.institution}</p>
                </div>
              ))}
              {candidate.education.length === 0 && (
                <EmptyText>No education history recorded.</EmptyText>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={assignmentOpen} onOpenChange={setAssignmentOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm L4 assignment</DialogTitle>
              <DialogDescription>
                Choose an active recruiter. Reassignment is effective immediately and retained in
                the candidate audit history.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>L4 recruiter</Label>
              <RecruiterPicker
                recruiters={recruitersQuery.data ?? []}
                value={recruiterId}
                onChange={setRecruiterId}
              />
              {recruiterId && (
                <p className="text-xs font-medium text-primary">
                  Selected:{" "}
                  {recruitersQuery.data?.find((item) => item.id === recruiterId)?.full_name ||
                    recruitersQuery.data?.find((item) => item.id === recruiterId)?.email}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAssignmentOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!recruiterId || assignmentMutation.isPending}
                onClick={() => assignmentMutation.mutate()}
              >
                {assignmentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm assignment
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}

function CandidateState({
  message,
  loading = false,
  error = false,
}: {
  message: string;
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <>
      <AppTopbar title="Candidate" />
      <main className="flex-1 p-6 md:p-8">
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
      </main>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold">{value ?? "Not recorded"}</p>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-xs text-muted-foreground">{children}</p>;
}
