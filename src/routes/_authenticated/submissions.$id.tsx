import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import {
  ArrowLeft,
  Loader2,
  Send,
  Sparkles,
  CalendarPlus,
  Trash2,
  Mail,
  User,
  FileText,
  MessageSquare,
  CalendarClock,
  Trophy,
} from "lucide-react";
import {
  getSubmission,
  changeSubmissionStage,
  addSubmissionNote,
  markSubmissionEmailSent,
  deleteSubmission,
  updateSubmission,
} from "@/lib/submissions.functions";
import { scheduleInterview, updateInterview, deleteInterview } from "@/lib/interviews.functions";
import { updatePlacement } from "@/lib/placements.functions";
import { getSafeHttpUrl } from "@/lib/safe-url";
import {
  SUBMISSION_STAGES,
  STAGE_LABEL,
  STAGE_STYLE,
  INTERVIEW_ROUNDS,
  ROUND_LABEL,
  INTERVIEW_OUTCOMES,
  OUTCOME_LABEL,
  OUTCOME_STYLE,
  PLACEMENT_STATUSES,
  PLACEMENT_STYLE,
  type SubmissionStage,
  type InterviewRound,
  type InterviewOutcome,
  type PlacementStatus,
} from "@/lib/submissions-constants";

export const Route = createFileRoute("/_authenticated/submissions/$id")({
  head: () => ({ meta: [{ title: "Submission — Staffinix" }] }),
  component: SubmissionDetailPage,
});

function SubmissionDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getFn = useServerFn(getSubmission);
  const stageFn = useServerFn(changeSubmissionStage);
  const noteFn = useServerFn(addSubmissionNote);
  const emailSentFn = useServerFn(markSubmissionEmailSent);
  const delFn = useServerFn(deleteSubmission);
  const updateFn = useServerFn(updateSubmission);
  const scheduleFn = useServerFn(scheduleInterview);
  const updateIntFn = useServerFn(updateInterview);
  const deleteIntFn = useServerFn(deleteInterview);
  const updatePlacFn = useServerFn(updatePlacement);

  const { data, isLoading } = useQuery({
    queryKey: ["submission", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["submission", id] });

  const stageMutation = useMutation({
    mutationFn: (payload: {
      to_stage: SubmissionStage;
      message?: string;
      rejected_reason?: string;
    }) => stageFn({ data: { id, ...payload } }),
    onSuccess: () => {
      invalidate();
      toast.success("Stage updated");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const emailSentMutation = useMutation({
    mutationFn: () => emailSentFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Email marked sent");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Submission deleted");
      navigate({ to: "/submissions" });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) {
    return (
      <>
        <AppTopbar title="Submission" />
        <main className="flex-1 space-y-6 p-6 md:p-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </main>
      </>
    );
  }
  if (!data) return null;

  const { submission, events, interviews, placement } = data;
  const stage = submission.stage as SubmissionStage;

  return (
    <>
      <AppTopbar title="Submission" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/submissions">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> All submissions
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={STAGE_STYLE[stage]}>
              {STAGE_LABEL[stage]}
            </Badge>
            <Select
              value=""
              onValueChange={(v) => stageMutation.mutate({ to_stage: v as SubmissionStage })}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Move to…" />
              </SelectTrigger>
              <SelectContent>
                {SUBMISSION_STAGES.filter((s) => s !== stage).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => deleteMutation.mutate()}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <PageHeader
          title={`${submission.candidate?.first_name} ${submission.candidate?.last_name} → ${submission.requirement?.title}`}
          description={`Created ${formatDistanceToNow(new Date(submission.created_at), { addSuffix: true })}${submission.submitted_at ? ` · Submitted ${formatDistanceToNow(new Date(submission.submitted_at), { addSuffix: true })}` : ""}`}
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {/* LEFT: main content */}
          <div className="space-y-6 lg:col-span-2">
            <Tabs defaultValue="email">
              <TabsList>
                <TabsTrigger value="email">
                  <Mail className="mr-1.5 h-3.5 w-3.5" /> Email
                </TabsTrigger>
                <TabsTrigger value="timeline">
                  <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Timeline ({events.length})
                </TabsTrigger>
                <TabsTrigger value="interviews">
                  <CalendarClock className="mr-1.5 h-3.5 w-3.5" /> Interviews ({interviews.length})
                </TabsTrigger>
                {placement && (
                  <TabsTrigger value="placement">
                    <Trophy className="mr-1.5 h-3.5 w-3.5" /> Placement
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="email" className="mt-4">
                <EmailPanel
                  submission={submission}
                  onSave={async (values) => {
                    await updateFn({ data: { id, values } });
                    invalidate();
                    toast.success("Email saved");
                  }}
                  onMarkSent={() => emailSentMutation.mutate()}
                />
              </TabsContent>

              <TabsContent value="timeline" className="mt-4 space-y-4">
                <NoteComposer
                  onSubmit={async (msg) => {
                    await noteFn({ data: { id, message: msg } });
                    invalidate();
                    toast.success("Note added");
                  }}
                />
                <TimelineList events={events} />
              </TabsContent>

              <TabsContent value="interviews" className="mt-4 space-y-4">
                <ScheduleInterviewDialog
                  submissionId={id}
                  scheduleFn={scheduleFn}
                  onCreated={() => invalidate()}
                />
                <InterviewList
                  interviews={interviews}
                  onUpdate={async (iid, values) => {
                    await updateIntFn({ data: { id: iid, values } });
                    invalidate();
                    toast.success("Interview updated");
                  }}
                  onDelete={async (iid) => {
                    await deleteIntFn({ data: { id: iid } });
                    invalidate();
                    toast.success("Interview removed");
                  }}
                />
              </TabsContent>

              {placement && (
                <TabsContent value="placement" className="mt-4">
                  <PlacementPanel
                    placement={placement}
                    onSave={async (values) => {
                      await updatePlacFn({ data: { id: placement.id, values } });
                      invalidate();
                      toast.success("Placement saved");
                    }}
                  />
                </TabsContent>
              )}
            </Tabs>
          </div>

          {/* RIGHT: context */}
          <div className="space-y-4">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-primary" /> Candidate
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <p className="font-medium text-foreground">
                  {submission.candidate?.first_name} {submission.candidate?.last_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {submission.candidate?.current_title ?? "—"}
                  {submission.candidate?.current_employer
                    ? ` @ ${submission.candidate.current_employer}`
                    : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {submission.candidate?.location ?? "—"} ·{" "}
                  {submission.candidate?.visa_status ?? "—"} ·{" "}
                  {submission.candidate?.experience_years ?? "?"} yrs
                </p>
                <div className="pt-2">
                  <Button variant="outline" size="sm" asChild className="w-full">
                    <Link to="/candidates/$id" params={{ id: submission.candidate?.id ?? "" }}>
                      Open profile
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-primary" /> Requirement
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <p className="font-medium text-foreground">{submission.requirement?.title}</p>
                <p className="text-xs text-muted-foreground">
                  {submission.requirement?.primary_technology ?? "—"} ·{" "}
                  {submission.requirement?.location ?? "—"} (
                  {submission.requirement?.work_mode ?? "—"})
                </p>
                <p className="text-xs text-muted-foreground">
                  Visa: {(submission.requirement?.visa_types ?? []).join(", ") || "—"}
                </p>
                <div className="pt-2">
                  <Button variant="outline" size="sm" asChild className="w-full">
                    <Link to="/requirements/$id" params={{ id: submission.requirement?.id ?? "" }}>
                      Open requirement
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {submission.match_score != null && (
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-primary" /> AI match
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-2xl font-semibold text-foreground">
                    {Math.round((submission.match_score ?? 0) * 100)}%
                  </p>
                  {(submission.match_strengths ?? []).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Strengths</p>
                      <ul className="mt-1 space-y-0.5 text-xs text-foreground">
                        {(submission.match_strengths ?? []).map((s) => (
                          <li key={s}>• {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(submission.match_gaps ?? []).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Gaps</p>
                      <ul className="mt-1 space-y-0.5 text-xs text-foreground">
                        {(submission.match_gaps ?? []).map((s) => (
                          <li key={s}>• {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

// ============================================================
// Email panel
// ============================================================
type SubmissionRow = Awaited<ReturnType<typeof getSubmission>>["submission"];

function EmailPanel({
  submission,
  onSave,
  onMarkSent,
}: {
  submission: SubmissionRow;
  onSave: (v: {
    email_to?: string | null;
    email_cc?: string | null;
    email_subject?: string | null;
    email_body?: string | null;
  }) => Promise<void>;
  onMarkSent: () => void;
}) {
  const [to, setTo] = useState(submission.email_to ?? "");
  const [cc, setCc] = useState(submission.email_cc ?? "");
  const [subject, setSubject] = useState(submission.email_subject ?? "");
  const [body, setBody] = useState(submission.email_body ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-sm">Submission email</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>CC</Label>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Subject</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Body</Label>
          <Textarea
            rows={16}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            {submission.email_sent_at
              ? `Sent ${formatDistanceToNow(new Date(submission.email_sent_at), { addSuffix: true })}`
              : "Not yet sent"}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await onSave({
                    email_to: to || null,
                    email_cc: cc || null,
                    email_subject: subject || null,
                    email_body: body || null,
                  });
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save
            </Button>
            {!submission.email_sent_at && (
              <Button onClick={onMarkSent}>
                <Send className="mr-2 h-4 w-4" /> Mark as sent
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Timeline / notes
// ============================================================

function NoteComposer({ onSubmit }: { onSubmit: (msg: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-2 p-4">
        <Textarea
          rows={2}
          placeholder="Add a note (visible to your team)…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={busy || text.trim().length < 2}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(text.trim());
                setText("");
              } finally {
                setBusy(false);
              }
            }}
          >
            Post note
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type TimelineEvent = Awaited<ReturnType<typeof getSubmission>>["events"][number];

function TimelineList({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No events yet. Actions and notes will appear here.
      </p>
    );
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {labelForEvent(e.event_type)}
              {e.from_stage && e.to_stage && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {STAGE_LABEL[e.from_stage as SubmissionStage]} →{" "}
                  {STAGE_LABEL[e.to_stage as SubmissionStage]}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {e.actor_email ?? "system"} ·{" "}
              {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
            </p>
          </div>
          {e.message && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{e.message}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

function labelForEvent(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============================================================
// Interviews
// ============================================================

function ScheduleInterviewDialog({
  submissionId,
  scheduleFn,
  onCreated,
}: {
  submissionId: string;
  scheduleFn: ReturnType<typeof useServerFn<typeof scheduleInterview>>;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState<InterviewRound>("l1");
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState("45");
  const [tz, setTz] = useState("America/New_York");
  const [link, setLink] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      scheduleFn({
        data: {
          submission_id: submissionId,
          round,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          duration_minutes: Number(duration) || 45,
          timezone: tz,
          meeting_link: link || null,
          interviewer_name: name || null,
          interviewer_email: email || null,
          notes: notes || null,
          outcome: "scheduled",
        },
      }),
    onSuccess: () => {
      toast.success("Interview scheduled");
      setOpen(false);
      onCreated();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CalendarPlus className="mr-1.5 h-4 w-4" /> Schedule interview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule interview</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Round</Label>
              <Select value={round} onValueChange={(v) => setRound(v as InterviewRound)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVIEW_ROUNDS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROUND_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Duration (min)</Label>
              <Input value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Scheduled at</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Input value={tz} onChange={(e) => setTz(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Meeting link</Label>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Interviewer</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Interviewer email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Interview = Awaited<ReturnType<typeof getSubmission>>["interviews"][number];

function InterviewList({
  interviews,
  onUpdate,
  onDelete,
}: {
  interviews: Interview[];
  onUpdate: (
    id: string,
    values: { outcome?: InterviewOutcome; feedback?: string; score?: number },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  if (interviews.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No interviews scheduled yet.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {interviews.map((i) => (
        <InterviewRow key={i.id} interview={i} onUpdate={onUpdate} onDelete={onDelete} />
      ))}
    </div>
  );
}

function InterviewRow({
  interview,
  onUpdate,
  onDelete,
}: {
  interview: Interview;
  onUpdate: (
    id: string,
    values: { outcome?: InterviewOutcome; feedback?: string; score?: number },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [feedback, setFeedback] = useState(interview.feedback ?? "");
  const [score, setScore] = useState(interview.score?.toString() ?? "");
  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">
                {ROUND_LABEL[interview.round as InterviewRound]}
              </span>
              <Badge
                variant="outline"
                className={OUTCOME_STYLE[interview.outcome as InterviewOutcome]}
              >
                {OUTCOME_LABEL[interview.outcome as InterviewOutcome]}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-foreground">
              {interview.scheduled_at
                ? format(new Date(interview.scheduled_at), "EEE, MMM d · h:mm a")
                : "Time TBD"}{" "}
              <span className="text-xs text-muted-foreground">
                · {interview.duration_minutes ?? 45} min · {interview.timezone}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {interview.interviewer_name ?? "—"}
              {interview.interviewer_email ? ` · ${interview.interviewer_email}` : ""}
            </p>
            {getSafeHttpUrl(interview.meeting_link) && (
              <a
                href={getSafeHttpUrl(interview.meeting_link) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Join link
              </a>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => onDelete(interview.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="col-span-1 space-y-1.5">
            <Label className="text-xs">Outcome</Label>
            <Select
              value={interview.outcome}
              onValueChange={(v) => onUpdate(interview.id, { outcome: v as InterviewOutcome })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVIEW_OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>
                    {OUTCOME_LABEL[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1 space-y-1.5">
            <Label className="text-xs">Score (0-10)</Label>
            <Input
              type="number"
              min={0}
              max={10}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              onBlur={() => {
                const n = score === "" ? undefined : Number(score);
                if (n === undefined || (n >= 0 && n <= 10)) {
                  onUpdate(interview.id, { score: n });
                }
              }}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Feedback</Label>
            <Textarea
              rows={2}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onBlur={() => onUpdate(interview.id, { feedback })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Placement panel
// ============================================================

type Placement = NonNullable<Awaited<ReturnType<typeof getSubmission>>["placement"]>;

function PlacementPanel({
  placement,
  onSave,
}: {
  placement: Placement;
  onSave: (values: {
    start_date?: string | null;
    end_date?: string | null;
    bill_rate?: number | null;
    pay_rate?: number | null;
    currency?: string;
    status?: PlacementStatus;
    notes?: string | null;
  }) => Promise<void>;
}) {
  const [startDate, setStartDate] = useState(placement.start_date ?? "");
  const [endDate, setEndDate] = useState(placement.end_date ?? "");
  const [billRate, setBillRate] = useState(placement.bill_rate?.toString() ?? "");
  const [payRate, setPayRate] = useState(placement.pay_rate?.toString() ?? "");
  const [status, setStatus] = useState<PlacementStatus>(placement.status as PlacementStatus);
  const [notes, setNotes] = useState(placement.notes ?? "");

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Trophy className="h-4 w-4 text-success" /> Placement
          <Badge variant="outline" className={PLACEMENT_STYLE[status]}>
            {status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Start date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>End date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Bill rate</Label>
            <Input value={billRate} onChange={(e) => setBillRate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Pay rate</Label>
            <Input value={payRate} onChange={(e) => setPayRate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as PlacementStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLACEMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Margin</Label>
            <Input
              disabled
              value={
                billRate && payRate
                  ? (Number(billRate) - Number(payRate)).toFixed(2)
                  : (placement.margin ?? "—").toString()
              }
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() =>
              onSave({
                start_date: startDate || null,
                end_date: endDate || null,
                bill_rate: billRate ? Number(billRate) : null,
                pay_rate: payRate ? Number(payRate) : null,
                status,
                notes: notes || null,
              })
            }
          >
            Save placement
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
