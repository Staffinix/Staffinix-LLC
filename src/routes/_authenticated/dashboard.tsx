import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getCandidateAssignmentKpis,
  getDashboardOverview,
  getRecentActivity,
} from "@/lib/dashboard.functions";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/hooks/use-session";
import { useRoleLevel } from "@/hooks/use-role-level";
import { HelpCircle, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { StaggerContainer } from "@/components/motion/page-transition";
import { staggerItem } from "@/components/motion/variants";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { STATUS_LABEL, PRIORITY_LABEL } from "@/lib/requirements-constants";
import { canAccessFeature, getFeatureForPath } from "@/lib/feature-access";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Staffinix" },
      {
        name: "description",
        content:
          "Unified recruitment desk dashboard for KPIs, submissions trend, pipeline funnel, and team performance.",
      },
    ],
  }),
  component: UnifiedDashboardPage,
});

function UnifiedDashboardPage() {
  const overviewFn = useServerFn(getDashboardOverview);
  const activityFn = useServerFn(getRecentActivity);
  const assignmentKpisFn = useServerFn(getCandidateAssignmentKpis);
  const { data: profile } = useProfile();
  const { isAuthenticated } = useSession();
  const { level } = useRoleLevel();
  const accessIdentity = {
    roles: profile?.roles ?? [],
    platformRole: profile?.platformRole ?? null,
  };

  const {
    data: overview,
    isLoading: overviewLoading,
    isError: overviewError,
  } = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => overviewFn(),
    enabled: isAuthenticated,
  });
  const assignmentKpis = useQuery({
    queryKey: ["dashboard", "candidate-assignment-kpis"],
    queryFn: () => assignmentKpisFn(),
    enabled: isAuthenticated && level === "L4",
  });
  const {
    data: activity,
    isLoading: activityLoading,
    isError: activityError,
  } = useQuery({
    queryKey: ["dashboard", "activity"],
    queryFn: () => activityFn(),
    enabled: isAuthenticated,
  });
  const stats = overview?.kpis;
  const trend = overview?.trend;
  const funnel = overview?.funnel;
  const reqs = overview?.requirements;
  const recruiters = overview?.recruiters;

  const pageDescription = `${profile?.roleTitle ?? "Team"} workspace`;

  const activeCandidatesCount = stats?.activeConsultants ?? 0;
  const openReqsCount = stats?.openRequirements ?? 0;
  const placementsCount = stats?.activePlacements ?? 0;
  const subsThisWeekCount = stats?.submissionsThisWeek ?? 0;
  const interviewsCount = stats?.interviewsScheduled ?? 0;
  const benchReadyCount = stats?.benchReady ?? 0;
  const hires30dCount = stats?.hiresThisMonth ?? 0;
  const urgentRequirementsCount =
    reqs?.by_priority.find((priority) => priority.name === "urgent")?.value ?? 0;

  const kpiList: {
    label: string;
    value: number | string;
    hint: string;
    to: string;
    note?: string;
  }[] = [
    {
      label: level === "L4" ? "My active candidates" : "Active candidates",
      value: activeCandidatesCount,
      hint:
        level === "L4"
          ? "Active candidates currently assigned to you"
          : "Total active candidates on desk",
      to: "/candidates",
    },
    {
      label: "Open requirements",
      value: openReqsCount,
      hint: "Currently active job requirements",
      note: urgentRequirementsCount ? `${urgentRequirementsCount} urgent` : undefined,
      to: "/requirements",
    },
    {
      label: "Placements",
      value: placementsCount,
      hint: "Active candidate placements",
      to: "/placements",
    },
    {
      label: "AI match accuracy",
      value: "—",
      hint: "Average AI candidate-role fit score",
      to: "/matching",
    },
    {
      label: level === "L4" ? "My submissions this week" : "Submissions this week",
      value: subsThisWeekCount,
      hint: "Candidates submitted to clients this week",
      to: "/submissions/board",
    },
    {
      label: "Interviews scheduled",
      value: interviewsCount,
      hint: "Interviews taking place this week",
      to: "/interviews",
    },
    {
      label: "Bench ready",
      value: benchReadyCount,
      hint: "Immediate availability bench candidates",
      to: "/candidates",
    },
    {
      label: "Hires, last 30 days",
      value: hires30dCount,
      hint: "Successful candidate hires in last 30 days",
      to: "/submissions/board",
    },
  ].filter((item) => {
    const feature = getFeatureForPath(item.to);
    return feature ? canAccessFeature(accessIdentity, feature) : true;
  });

  const funnelStages = [
    { key: "Submitted", stage: "submitted" },
    { key: "Vendor review", stage: "vendor_review" },
    { key: "Client review", stage: "client_review" },
    { key: "Interview", stage: "interview" },
    { key: "Offer", stage: "offer" },
    { key: "Hired", stage: "hired" },
  ].map((item) => ({
    ...item,
    count: funnel?.find((stage) => stage.stage === item.stage)?.count ?? 0,
  }));
  const funnelMax = Math.max(...funnelStages.map((f) => f.count), 1);

  // The API currently returns submitted and hired counts. Do not infer the
  // missing stages from percentages because inferred business metrics look real.
  const trendData = (trend ?? []).map((t) => ({
    label: t.label,
    Submitted: t.submissions,
    Hired: t.hired,
  }));

  if (overviewLoading || activityLoading) {
    return (
      <>
        <AppTopbar title="Dashboard" />
        <main className="flex-1 space-y-6 px-4 pb-6 pt-6 sm:px-6 md:px-8">
          <div className="space-y-2 border-b border-border/80 pb-6">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-full max-w-xl" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        </main>
      </>
    );
  }

  return (
    <TooltipProvider>
      <AppTopbar title="Dashboard" />
      <main className="flex-1 space-y-6 px-4 pb-6 pt-6 sm:px-6 md:px-8">
        <PageHeader title="Desk overview" description={pageDescription} />

        {level === "L4" && (
          <section aria-labelledby="my-assigned-candidates" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="my-assigned-candidates" className="text-sm font-semibold">
                  My assigned candidates
                </h2>
                <p className="text-xs text-muted-foreground">Candidates assigned to you</p>
              </div>
              <Button asChild size="sm">
                <Link to="/submissions/new" search={{}}>
                  Submit candidate
                </Link>
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Assigned", assignmentKpis.data?.assigned ?? 0],
                ["Submitted", assignmentKpis.data?.submitted ?? 0],
                ["Pending", assignmentKpis.data?.pending ?? 0],
              ].map(([label, value]) => (
                <Link key={label} to="/candidates" className="block">
                  <Card className="transition-colors hover:border-border-strong">
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">{label}</p>
                      <p className="mt-1 text-2xl font-medium tabular-nums">{value}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {(overviewError || activityError) && (
          <div
            className="surface-raised flex items-start gap-3 rounded-xl border-destructive/25 p-3.5 text-sm"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-foreground">Some dashboard data is unavailable</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The rest of your workspace is still available. Refresh to retry the live metrics.
              </p>
            </div>
          </div>
        )}

        {/* 8 KPIs Grid */}
        <StaggerContainer className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
          {kpiList.map((k) => (
            <motion.div key={k.label} variants={staggerItem}>
              <Link to={k.to} className="block h-full">
                <Card className="h-full transition-colors hover:border-border-strong">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-1">
                      <p className="text-sm text-muted-foreground">{k.label}</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle
                            aria-label={k.hint}
                            className="h-3 w-3 cursor-help text-muted-foreground/70"
                          />
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">{k.hint}</TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between gap-2">
                      <p className="text-3xl font-medium tabular-nums text-foreground">{k.value}</p>
                      {k.note && <span className="text-xs text-destructive">{k.note}</span>}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </StaggerContainer>

        {/* Section 2: Recent Trends & Pipeline Funnel */}
        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="border-border bg-card lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Recent trends (14 days)</CardTitle>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-primary" /> Submitted
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-chart-2" /> Hired
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      allowDecimals={false}
                    />
                    <RechartsTooltip
                      itemStyle={{ color: "var(--popover-foreground)" }}
                      contentStyle={{
                        background: "var(--popover)",
                        color: "var(--popover-foreground)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="Submitted"
                      stroke="var(--primary)"
                      fill="var(--primary)"
                      fillOpacity={0.08}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="Hired"
                      stroke="var(--chart-2)"
                      fill="none"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pipeline funnel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {funnelStages.map((f) => {
                const pct = (f.count / funnelMax) * 100;
                return (
                  <div key={f.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground/90">{f.key}</span>
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {f.count}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-sm bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-sm",
                          f.stage === "hired" ? "bg-primary" : "bg-chart-3",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>

        {/* Section 3: Requirements, Priority & Recruiter Leaderboard */}
        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Requirements by status</CardTitle>
            </CardHeader>
            <CardContent>
              {reqs && reqs.by_status.length > 0 ? (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={reqs.by_status}
                      margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                    >
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        tickFormatter={(v) => STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        allowDecimals={false}
                      />
                      <RechartsTooltip
                        cursor={{ fill: "var(--muted)", fillOpacity: 0.5, stroke: "none" }}
                        itemStyle={{ color: "var(--popover-foreground)" }}
                        contentStyle={{
                          background: "var(--popover)",
                          color: "var(--popover-foreground)",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                        labelFormatter={(v) =>
                          STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? String(v)
                        }
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {reqs.by_status.map((s) => (
                          <Cell
                            key={s.name}
                            fill={s.name === "open" ? "var(--primary)" : "var(--chart-4)"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                  No requirements yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Priority mix</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reqs && reqs.by_priority.length > 0 ? (
                reqs.by_priority.map((p) => {
                  const total = reqs.by_priority.reduce((a, b) => a + b.value, 0);
                  const pct = total ? (p.value / total) * 100 : 0;
                  const label = PRIORITY_LABEL[p.name as keyof typeof PRIORITY_LABEL] ?? p.name;
                  return (
                    <div key={p.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold text-foreground">{p.value}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-sm bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-sm",
                            p.name === "urgent" ? "bg-destructive" : "bg-chart-3",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="py-8 text-center text-xs text-muted-foreground">No priority data.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recruiter leaderboard</CardTitle>
              <span className="text-xs text-muted-foreground">This quarter</span>
            </CardHeader>
            <CardContent className="space-y-2">
              {(recruiters ?? []).map((r, i) => (
                <div key={r.id || r.name} className="flex items-center gap-2 py-1">
                  <span className="w-4 text-center font-mono text-xs font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <Avatar className="h-7 w-7">
                    <AvatarImage
                      src={"avatar_url" in r ? (r.avatar_url ?? undefined) : undefined}
                    />
                    <AvatarFallback className="bg-surface-2 text-[11px] font-semibold">
                      {initials(r.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.hires} hires · {r.submissions} submissions
                    </p>
                  </div>
                </div>
              ))}
              {(!recruiters || recruiters.length === 0) && (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No recruiter activity yet.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Section 4: Jump in & Your Activity Cards (Hidden for L2 Executive View) */}
        {level !== "L2" && (
          <section className="grid gap-4 lg:grid-cols-2">
            {/* Jump in Card */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Quick links</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {canAccessFeature(accessIdentity, "requirements") && (
                  <Link
                    to="/requirements"
                    className="rounded-lg border border-border p-3 transition-colors hover:bg-accent"
                  >
                    <div className="text-sm font-medium text-foreground">Requirements</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Review active job roles, client details, and parsed job descriptions.
                    </p>
                  </Link>
                )}

                {canAccessFeature(accessIdentity, "candidates") && (
                  <Link
                    to="/candidates"
                    className="rounded-lg border border-border p-3 transition-colors hover:bg-accent"
                  >
                    <div className="text-sm font-medium text-foreground">Bench candidates</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Browse candidate bench and review candidate profiles.
                    </p>
                  </Link>
                )}

                {canAccessFeature(accessIdentity, "submissions") && (
                  <Link
                    to="/submissions/board"
                    className="rounded-lg border border-border p-3 transition-colors hover:bg-accent"
                  >
                    <div className="text-sm font-medium text-foreground">Submissions board</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Track candidate submission stages from Submitted to Hired.
                    </p>
                  </Link>
                )}
              </CardContent>
            </Card>

            {/* Your Activity Card */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Your activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(activity ?? []).slice(0, 5).map((a) => {
                  const item = formatActivityItem(a);
                  return (
                    <div
                      key={a.id}
                      className="flex items-start gap-2.5 text-xs pb-2.5 border-b border-border/50 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-foreground text-xs">{item.title}</p>
                          <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                            {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                          {item.details}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {(!activity || activity.length === 0) && (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    No recent activity.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>
        )}
      </main>
    </TooltipProvider>
  );
}

type ActivityLog = Awaited<ReturnType<typeof getRecentActivity>>[number];

function getActivityMetadata(metadata: ActivityLog["metadata"]): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

function formatActivityItem(a: ActivityLog) {
  const metadata = getActivityMetadata(a.metadata);
  if (typeof metadata.title === "string" && typeof metadata.description === "string") {
    return {
      title: metadata.title,
      details: metadata.description,
    };
  }

  const action = String(a.action || "");
  const entityId = String(a.entity_id || "");

  return {
    title: action
      .split(".")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
    details:
      (typeof metadata.description === "string" ? metadata.description : null) ||
      (entityId
        ? `Activity logged for ${a.entity_type || "item"} #${entityId}`
        : "Activity recorded."),
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
