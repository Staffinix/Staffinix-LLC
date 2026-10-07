import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  Download,
  ExternalLink,
  FileText,
  History,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getSafeHttpUrl } from "@/lib/safe-url";
import { getCandidate, getResumeSignedUrl } from "@/lib/candidates.functions";
import { getBenchConsultantActivity } from "@/lib/bench.functions";
import {
  CANDIDATE_STATUS_LABEL,
  CANDIDATE_STATUS_STYLES,
  AVAILABILITY_LABEL,
  type Availability,
  type CandidateStatus,
} from "@/lib/candidates-constants";
import {
  STAGE_LABEL,
  STAGE_STYLE,
  ROUND_LABEL,
  OUTCOME_LABEL,
  OUTCOME_STYLE,
  type SubmissionStage,
  type InterviewRound,
  type InterviewOutcome,
} from "@/lib/submissions-constants";

export const Route = createFileRoute("/_authenticated/bench/$id")({
  head: () => ({
    meta: [
      { title: "Bench consultant — Staffinix" },
      {
        name: "description",
        content: "Consultant profile, resume versions, activity, and pipeline.",
      },
    ],
  }),
  component: BenchConsultantPage,
});

function BenchConsultantPage() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getCandidate);
  const actFn = useServerFn(getBenchConsultantActivity);

  const c = useQuery({ queryKey: ["candidate", id], queryFn: () => getFn({ data: { id } }) });
  const act = useQuery({
    queryKey: ["bench-activity", id],
    queryFn: () => actFn({ data: { candidate_id: id } }),
  });

  if (c.isPending) return <Loading />;
  if (c.isError || !c.data) return <NotFound />;
  const cand = c.data;
  const status = cand.status as CandidateStatus;
  const availKey = (cand.availability ?? null) as Availability | null;

  const subs = act.data?.submissions ?? [];
  const interviews = act.data?.interviews ?? [];
  const history = act.data?.history ?? [];
  const activeSubs = subs.filter((s) =>
    ["submitted", "vendor_review", "client_review", "interview", "offer"].includes(s.stage),
  ).length;
  const upcomingInterviews = interviews.filter(
    (i) => i.outcome === "scheduled" && i.scheduled_at && new Date(i.scheduled_at) >= new Date(),
  ).length;

  return (
    <>
      <AppTopbar title={`${cand.first_name} ${cand.last_name}`} />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/bench">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to bench
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/candidates/$id" params={{ id }}>
              Full candidate profile <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <PageHeader
          title={`${cand.first_name} ${cand.last_name}`}
          description={
            cand.current_title
              ? `${cand.current_title}${cand.current_employer ? ` @ ${cand.current_employer}` : ""}`
              : "Bench consultant"
          }
          actions={
            <div className="flex items-center gap-2">
              {availKey && (
                <Badge
                  className={cn(
                    "border",
                    availKey === "immediate"
                      ? "bg-success/15 text-success border-success/30"
                      : "bg-primary/10 text-primary border-primary/20",
                  )}
                >
                  {AVAILABILITY_LABEL[availKey]}
                </Badge>
              )}
              <Badge className={cn("border", CANDIDATE_STATUS_STYLES[status])}>
                {CANDIDATE_STATUS_LABEL[status]}
              </Badge>
            </div>
          }
        />

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat
            label="Active submissions"
            value={activeSubs}
            icon={<Briefcase className="h-3.5 w-3.5" />}
          />
          <MiniStat
            label="Upcoming interviews"
            value={upcomingInterviews}
            icon={<CalendarDays className="h-3.5 w-3.5" />}
            accent
          />
          <MiniStat
            label="Resume versions"
            value={(cand.resumes?.length ?? 0) + (cand.versions?.length ?? 0)}
            icon={<FileText className="h-3.5 w-3.5" />}
          />
          <MiniStat
            label="Experience"
            value={cand.experience_years ? `${cand.experience_years}y` : "—"}
            icon={<UserCheck className="h-3.5 w-3.5" />}
          />
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-border bg-card md:col-span-2">
            <CardContent className="grid gap-3 p-4 text-sm md:grid-cols-2">
              <Info icon={Mail} label="Email" value={cand.email} />
              <Info icon={Phone} label="Phone" value={cand.phone} />
              <Info icon={MapPin} label="Location" value={cand.location} />
              <Info icon={Briefcase} label="Visa" value={cand.visa_status} />
              <Info label="Primary tech" value={cand.primary_technology} />
              <Info
                label="Rate"
                value={
                  cand.min_rate || cand.max_rate
                    ? `${cand.currency} ${cand.min_rate ?? "?"}–${cand.max_rate ?? "?"}${cand.rate_type ? `/${cand.rate_type}` : ""}`
                    : null
                }
              />
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> AI notes
              </CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
              {cand.ai_notes?.trim() || "No AI notes captured yet."}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="skills">
          <TabsList>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="resumes">Resume versions</TabsTrigger>
            <TabsTrigger value="submissions">Submissions ({subs.length})</TabsTrigger>
            <TabsTrigger value="interviews">Interviews ({interviews.length})</TabsTrigger>
            <TabsTrigger value="history">
              <History className="mr-1.5 h-3.5 w-3.5" /> Availability history
            </TabsTrigger>
          </TabsList>

          <TabsContent value="skills" className="mt-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                {cand.skills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No skills captured yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {cand.skills.map((s) => (
                      <Badge
                        key={s.id}
                        variant={s.is_primary ? "default" : "outline"}
                        className="text-xs"
                      >
                        {s.skill}
                        {s.years ? ` · ${s.years}y` : ""}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="resumes" className="mt-4 space-y-3">
            {cand.resumes.length === 0 && cand.versions.length === 0 && (
              <Card className="border-border bg-card">
                <CardContent className="p-6 text-sm text-muted-foreground">
                  No resumes on file. Upload one from the candidate profile.
                </CardContent>
              </Card>
            )}
            {cand.resumes.map((r) => (
              <ResumeRow
                key={r.id}
                title={r.file_name}
                subtitle={`${r.mime_type ?? "—"}${r.size_bytes ? ` · ${(r.size_bytes / 1024).toFixed(0)} KB` : ""}${r.is_primary ? " · Primary" : ""}`}
                path={r.file_path}
                createdAt={r.created_at}
              />
            ))}
            {cand.versions.length > 0 && (
              <div>
                <h3 className="mb-2 mt-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Tailored versions
                </h3>
                <div className="space-y-2">
                  {cand.versions.map((v) => (
                    <ResumeRow
                      key={v.id}
                      title={`Version #${v.version_no}${v.requirement_id ? " · tailored" : ""}`}
                      subtitle={
                        [
                          v.ats_score != null ? `ATS ${v.ats_score}` : null,
                          v.match_score != null ? `Match ${v.match_score}` : null,
                          v.notes ?? null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Tailored resume"
                      }
                      path={v.file_path}
                      createdAt={v.created_at}
                    />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="submissions" className="mt-4 space-y-2">
            {subs.length === 0 && (
              <Card className="border-border bg-card">
                <CardContent className="p-6 text-sm text-muted-foreground">
                  No submissions yet.{" "}
                  <Link to="/submissions/new" className="text-primary hover:underline">
                    Create one
                  </Link>
                  .
                </CardContent>
              </Card>
            )}
            {subs.map((s) => {
              const stage = s.stage as SubmissionStage;
              return (
                <Card key={s.id} className="border-border bg-card">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <Link
                        to="/submissions/$id"
                        params={{ id: s.id }}
                        className="font-medium hover:underline"
                      >
                        {s.requirement?.title ?? "Requirement"}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {s.requirement?.primary_technology ?? "—"} ·{" "}
                        {s.requirement?.location ?? "—"}
                        {s.client?.name ? ` · ${s.client.name}` : ""}
                        {s.vendor?.name ? ` · ${s.vendor.name}` : ""}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        Updated {new Date(s.updated_at).toLocaleDateString()}
                        {s.submitted_rate
                          ? ` · ${s.currency ?? "USD"} ${s.submitted_rate}${s.rate_type ? `/${s.rate_type}` : ""}`
                          : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.match_score != null && (
                        <Badge variant="outline" className="text-[10px]">
                          Match {Math.round(s.match_score)}
                        </Badge>
                      )}
                      <Badge className={cn("border", STAGE_STYLE[stage])}>
                        {STAGE_LABEL[stage]}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="interviews" className="mt-4 space-y-2">
            {interviews.length === 0 && (
              <Card className="border-border bg-card">
                <CardContent className="p-6 text-sm text-muted-foreground">
                  No interviews scheduled.
                </CardContent>
              </Card>
            )}
            {interviews.map((i) => {
              const outcome = i.outcome as InterviewOutcome;
              const round = i.round as InterviewRound;
              return (
                <Card key={i.id} className="border-border bg-card">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Badge variant="outline" className="text-[10px]">
                          {ROUND_LABEL[round]}
                        </Badge>
                        {i.scheduled_at
                          ? new Date(i.scheduled_at).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "Unscheduled"}
                        {i.timezone && (
                          <span className="text-xs text-muted-foreground">({i.timezone})</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {i.interviewer_name ?? "Interviewer TBD"}
                        {i.duration_minutes ? ` · ${i.duration_minutes} min` : ""}
                        {i.score != null ? ` · Score ${i.score}/10` : ""}
                      </div>
                      {i.feedback && (
                        <p className="mt-1 line-clamp-2 max-w-xl text-xs text-muted-foreground">
                          {i.feedback}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {getSafeHttpUrl(i.meeting_link) && (
                        <Button size="sm" variant="outline" asChild>
                          <a
                            href={getSafeHttpUrl(i.meeting_link) ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Join <ExternalLink className="ml-1.5 h-3 w-3" />
                          </a>
                        </Button>
                      )}
                      <Link
                        to="/submissions/$id"
                        params={{ id: i.submission_id }}
                        className="text-xs text-primary hover:underline"
                      >
                        View submission
                      </Link>
                      <Badge className={cn("border", OUTCOME_STYLE[outcome])}>
                        {OUTCOME_LABEL[outcome]}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Current availability</span>
                  <Badge variant="outline" className="text-[10px]">
                    {availKey ? AVAILABILITY_LABEL[availKey] : "Unknown"}
                  </Badge>
                </div>
                {history.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No availability changes logged yet. Updates will appear here as recruiters edit
                    this consultant.
                  </p>
                ) : (
                  <ol className="relative space-y-3 border-l border-border pl-4">
                    {history.map((h) => (
                      <li key={h.id} className="relative">
                        <span className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                        <div className="text-xs text-muted-foreground">
                          {new Date(h.created_at).toLocaleString()}{" "}
                          {h.actor_email ? `· ${h.actor_email}` : ""}
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">{humanAction(h.action)}</span>
                          {h.metadata_summary && (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              {h.metadata_summary}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

function ResumeRow({
  title,
  subtitle,
  path,
  createdAt,
}: {
  title: string;
  subtitle: string;
  path: string | null;
  createdAt: string;
}) {
  const [busy, setBusy] = useState(false);
  const signFn = useServerFn(getResumeSignedUrl);
  async function download() {
    if (!path) {
      toast.info("No file attached to this version.");
      return;
    }
    setBusy(true);
    try {
      const { url } = await signFn({ data: { path } });
      if (!url) {
        toast.info("Inline content — no downloadable file.");
        return;
      }
      const safeUrl = getSafeHttpUrl(url);
      if (!safeUrl) throw new Error("The generated download link is invalid.");
      window.open(safeUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="border-border bg-card">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">
              {subtitle} · {new Date(createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={download} disabled={busy || !path}>
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-4 w-4" />
          )}
          Download
        </Button>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p
              className={cn(
                "mt-1.5 text-2xl font-semibold",
                accent ? "text-success" : "text-foreground",
              )}
            >
              {value ?? "—"}
            </p>
          </div>
          {icon && (
            <div
              className={cn(
                "rounded-md p-1.5",
                accent ? "bg-success/10 text-success" : "bg-primary/10 text-primary",
              )}
            >
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Info({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | null | undefined;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </div>
      <div className="text-sm">{value ?? "—"}</div>
    </div>
  );
}

function humanAction(a: string): string {
  return a
    .replace(/^candidate\./, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function Loading() {
  return (
    <main className="flex-1 p-8">
      <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
    </main>
  );
}
function NotFound() {
  return (
    <main className="flex-1 p-8 text-center">
      <p className="text-sm text-muted-foreground">Consultant not found.</p>
      <Button variant="outline" size="sm" className="mt-3" asChild>
        <Link to="/bench">Back to bench</Link>
      </Button>
    </main>
  );
}
