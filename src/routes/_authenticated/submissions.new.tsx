import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, Loader2, ShieldCheck, Wand2, Send } from "lucide-react";
import { listCandidates } from "@/lib/candidates.functions";
import { listRequirements } from "@/lib/requirements.functions";
import { createSubmission, draftSubmissionEmail } from "@/lib/submissions.functions";

const searchSchema = z.object({
  candidate_id: z.string().uuid().optional(),
  requirement_id: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/submissions/new")({
  head: () => ({ meta: [{ title: "New submission — Staffinix" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: NewSubmissionPage,
});

function NewSubmissionPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/submissions/new" });
  const [candidateId, setCandidateId] = useState<string>(search.candidate_id ?? "");
  const [requirementId, setRequirementId] = useState<string>(search.requirement_id ?? "");
  const [rate, setRate] = useState<string>("");
  const [rateType, setRateType] = useState<string>("hourly");
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [notes, setNotes] = useState("");
  const [resumeVersionId, setResumeVersionId] = useState<string | null>(null);

  const candFn = useServerFn(listCandidates);
  const reqFn = useServerFn(listRequirements);
  const draftFn = useServerFn(draftSubmissionEmail);
  const createFn = useServerFn(createSubmission);

  const { data: cands } = useQuery({
    queryKey: ["cands-lite"],
    queryFn: () => candFn({ data: { page: 1, page_size: 100 } }),
  });
  const { data: reqs } = useQuery({
    queryKey: ["reqs-lite"],
    queryFn: () => reqFn({ data: { page: 1, page_size: 100 } }),
  });

  const candOptions = useMemo(() => cands?.rows ?? [], [cands?.rows]);
  const reqOptions = useMemo(() => reqs?.rows ?? [], [reqs?.rows]);

  const canDraft = Boolean(candidateId && requirementId);
  const selectedCand = useMemo(
    () => candOptions.find((c) => c.id === candidateId),
    [candOptions, candidateId],
  );
  const selectedReq = useMemo(
    () => reqOptions.find((r) => r.id === requirementId),
    [reqOptions, requirementId],
  );

  const resetGeneratedSubmission = () => {
    setResumeVersionId(null);
    setSubject("");
    setBody("");
  };

  const draftMutation = useMutation({
    mutationFn: () =>
      draftFn({
        data: {
          candidate_id: candidateId,
          requirement_id: requirementId,
        },
      }),
    onSuccess: (r) => {
      setSubject(r.subject);
      setBody(r.body);
      setResumeVersionId(r.resume_version_id);
      toast.success("Fact-preserving draft ready — review before saving");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const createMutation = useMutation({
    mutationFn: (stage: "draft" | "submitted") =>
      createFn({
        data: {
          candidate_id: candidateId,
          requirement_id: requirementId,
          resume_version_id: resumeVersionId,
          submitted_rate: rate ? Number(rate) : null,
          rate_type: rate ? (rateType as "hourly" | "annual" | "monthly") : null,
          currency: "USD",
          email_to: emailTo || null,
          email_cc: emailCc || null,
          email_subject: subject || null,
          email_body: body || null,
          notes: notes || null,
          stage,
        },
      }),
    onSuccess: (r) => {
      toast.success("Submission saved");
      navigate({ to: "/submissions/$id", params: { id: r.id } });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <>
      <AppTopbar title="New submission" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/submissions">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Link>
          </Button>
        </div>
        <PageHeader
          title="New submission"
          description="Attach an approved tailored resume, generate source-backed text, then review and submit."
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="border-border bg-card lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-sm">1. Pick candidate & requirement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Candidate</Label>
                <Select
                  value={candidateId}
                  onValueChange={(value) => {
                    setCandidateId(value);
                    resetGeneratedSubmission();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose candidate" />
                  </SelectTrigger>
                  <SelectContent>
                    {candOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.first_name} {c.last_name}
                        {c.current_title ? ` — ${c.current_title}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Requirement</Label>
                <Select
                  value={requirementId}
                  onValueChange={(value) => {
                    setRequirementId(value);
                    resetGeneratedSubmission();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose requirement" />
                  </SelectTrigger>
                  <SelectContent>
                    {reqOptions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.title}
                        {r.primary_technology ? ` — ${r.primary_technology}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Submitted rate</Label>
                  <Input
                    type="number"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="e.g. 65"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Rate type</Label>
                  <Select value={rateType} onValueChange={setRateType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedCand && selectedReq && (
                <div className="rounded-md border border-border bg-surface p-3 text-xs">
                  <p className="mb-1 font-medium text-foreground">Snapshot</p>
                  <p className="text-muted-foreground">
                    Sending{" "}
                    <span className="text-foreground">
                      {selectedCand.first_name} {selectedCand.last_name}
                    </span>{" "}
                    for <span className="text-foreground">{selectedReq.title}</span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-primary" /> 2. Source-backed submission email
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This draft uses only the immutable facts in an approved tailored resume. It does not
                ask AI to invent or expand candidate experience.
              </p>
              {canDraft && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/tailoring" search={{ candidateId, reqId: requirementId }}>
                    Review tailoring approval
                  </Link>
                </Button>
              )}
              <div className="flex justify-end">
                <Button
                  onClick={() => draftMutation.mutate()}
                  disabled={!canDraft || draftMutation.isPending}
                  variant="secondary"
                >
                  {draftMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="mr-2 h-4 w-4" />
                  )}
                  Build from approved facts
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>To</Label>
                  <Input
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="am@vendor.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>CC</Label>
                  <Input
                    value={emailCc}
                    onChange={(e) => setEmailCc(e.target.value)}
                    placeholder="teammate@…"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Body</Label>
                <Textarea
                  rows={14}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Internal notes</Label>
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Private notes for your team"
                />
              </div>

              <div className="flex items-center justify-between border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Nothing sends automatically — save as draft or mark as submitted.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={!canDraft || createMutation.isPending}
                    onClick={() => createMutation.mutate("draft")}
                  >
                    Save as draft
                  </Button>
                  <Button
                    disabled={!canDraft || !resumeVersionId || createMutation.isPending}
                    onClick={() => createMutation.mutate("submitted")}
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Save & mark submitted
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
