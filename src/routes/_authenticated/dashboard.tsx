import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  FileText,
  Send,
  Users,
  Briefcase,
  Trophy,
  CalendarClock,
  TrendingUp,
  Sparkles,
  UserCheck,
  HelpCircle,
  AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { StaggerContainer } from "@/components/motion/page-transition";
import { staggerItem } from "@/components/motion/variants";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
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

  const firstName =
    profile?.profile?.full_name?.split(" ")[0] ??
    (level === "L1"
      ? "Platform Admin"
      : level === "L2"
        ? "Executive"
        : level === "L3"
          ? "Developer"
          : "Recruiter");

  const pageDescription = `${profile?.roleTitle ?? "Team"} workspace — live recruitment operations and the features assigned to your role.`;

  const activeCandidatesCount = stats?.activeConsultants ?? 0;
  const openReqsCount = stats?.openRequirements ?? 0;
  const placementsCount = stats?.activePlacements ?? 0;
  const subsThisWeekCount = stats?.submissionsThisWeek ?? 0;
  const interviewsCount = stats?.interviewsScheduled ?? 0;
  const benchReadyCount = stats?.benchReady ?? 0;
  const hires30dCount = stats?.hiresThisMonth ?? 0;
  const urgentRequirementsCount =
    reqs?.by_priority.find((priority) => priority.name === "urgent")?.value ?? 0;

  const kpiList = [
    {
      label: level === "L4" ? "My Active Candidates" : "Active Candidates",
      value: activeCandidatesCount,
      hint:
        level === "L4"
          ? "Active candidates currently assigned to you"
          : "Total active candidates on desk",
      icon: Users,
      to: "/candidates",
      badge: `${activeCandidatesCount} current`,
      badgeClass: "bg-primary/10 text-primary border-primary/20",
    },
    {
      label: "Open Requisitions",
      value: openReqsCount,
      hint: "Currently active job requisitions",
      icon: FileText,
      to: "/requirements",
      badge: `${urgentRequirementsCount} urgent`,
      badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
    },
    {
      label: "Placements",
      value: placementsCount,
      hint: "Active candidate placements",
      icon: Trophy,
      to: "/placements",
      badge: "QTD",
      badgeClass: "bg-success/10 text-success border-success/20",
    },
    {
      label: "AI Match Accuracy",
      value: "—",
      hint: "Average AI candidate-role fit score",
      icon: Sparkles,
      to: "/matching",
      badge: "No score available",
      badgeClass: "bg-chart-5/10 text-chart-5 border-chart-5/20",
    },
    {
      label: level === "L4" ? "My submissions this week" : "Submissions this week",
      value: subsThisWeekCount,
      hint: "Candidates submitted to clients this week",
      icon: Send,
      to: "/interviews",
      badge: `${subsThisWeekCount} this week`,
      badgeClass: "bg-success/10 text-success border-success/20",
    },
    {
      label: "Interviews scheduled",
      value: interviewsCount,
      hint: "Interviews taking place this week",
      icon: CalendarClock,
      to: "/submissions/board",
      badge: `${interviewsCount} Active`,
      badgeClass: "bg-warning/10 text-warning border-warning/20",
    },
    {
      label: "Bench Ready",
      value: benchReadyCount,
      hint: "Immediate availability bench candidates",
      icon: Briefcase,
      to: "/candidates",
      badge: `${benchReadyCount} Immediate`,
      badgeClass: "bg-info/10 text-info border-info/20",
    },
    {
      label: "Hires (30d)",
      value: hires30dCount,
      hint: "Successful candidate hires in last 30 days",
      icon: UserCheck,
      to: "/submissions/board",
      badge: `${hires30dCount} in 30d`,
      badgeClass: "bg-success/10 text-success border-success/20",
    },
  ].filter((item) => {
    const feature = getFeatureForPath(item.to);
    return feature ? canAccessFeature(accessIdentity, feature) : true;
  });

  const funnelStages = [
    { key: "Submitted", stage: "submitted", color: "bg-blue-500" },
    { key: "Vendor Review", stage: "vendor_review", color: "bg-violet-500" },
    { key: "Client Review", stage: "client_review", color: "bg-purple-500" },
    { key: "Interview", stage: "interview", color: "bg-amber-500" },
    { key: "Offer", stage: "offer", color: "bg-emerald-500" },
    { key: "Hired", stage: "hired", color: "bg-green-600" },
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
        <main className="flex-1 space-y-6 px-4 pb-6 pt-2 sm:px-6 md:px-8">
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
      <main className="flex-1 space-y-6 px-4 pb-6 pt-2 sm:px-6 md:px-8">
        <PageHeader title={`Welcome back, ${firstName}`} description={pageDescription} />

        {level === "L4" && (
          <section aria-labelledby="my-assigned-candidates" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="my-assigned-candidates" className="text-sm font-semibold">
                  My Assigned Candidates
                </h2>
                <p className="text-xs text-muted-foreground">
                  Live ownership and submission progress from your assigned candidate desk.
                </p>
              </div>
              <Link
                to="/submissions/new"
                search={{}}
                className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
              >
                Submit Candidate
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Assigned", assignmentKpis.data?.assigned ?? 0],
                ["Submitted", assignmentKpis.data?.submitted ?? 0],
                ["Pending", assignmentKpis.data?.pending ?? 0],
              ].map(([label, value]) => (
                <Link key={label} to="/candidates" className="block">
                  <Card className="interactive-lift hover:border-primary/35">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 text-2xl font-bold">{value}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {(overviewError || activityError) && (
          <div
            className="glass flex items-start gap-3 rounded-xl border-destructive/25 p-3.5 text-sm"
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
          {kpiList.map((k) => {
            const Icon = k.icon;
            return (
              <motion.div key={k.label} variants={staggerItem}>
                <Link to={k.to} className="group block h-full">
                  <Card className="interactive-lift h-full hover:border-primary/35">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs text-muted-foreground">{k.label}</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-pointer" />
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">{k.hint}</TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="rounded-lg border border-primary/10 bg-primary/10 p-2 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <p className="text-2xl font-bold tracking-tight text-foreground">
                          {k.value}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] font-medium", k.badgeClass)}
                        >
                          {k.badge}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
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
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Hired
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="grad-sub" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="grad-short" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      allowDecimals={false}
                    />
                    <RechartsTooltip
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
                      fill="url(#grad-sub)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="Hired"
                      stroke="#10b981"
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
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-300", f.color)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>

        {/* Section 3: Requisitions, Priority & Recruiter Leaderboard */}
        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Requisitions by status</CardTitle>
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
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickFormatter={(v) => STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        allowDecimals={false}
                      />
                      <RechartsTooltip
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
                            fill={
                              s.name === "open"
                                ? "#3b82f6"
                                : s.name === "closed"
                                  ? "#10b981"
                                  : "#ef4444"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                  No requisitions yet.
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
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            p.name === "urgent"
                              ? "bg-destructive"
                              : p.name === "high"
                                ? "bg-warning"
                                : p.name === "medium"
                                  ? "bg-primary"
                                  : "bg-muted-foreground",
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
              <Badge variant="outline" className="gap-1 text-[10px]">
                <TrendingUp className="h-3 w-3" /> QTD
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {(recruiters ?? []).map((r, i) => (
                <div
                  key={r.id || r.name}
                  className="flex items-center gap-2.5 rounded-md border border-border bg-surface/60 p-2 transition-all hover:border-primary/30"
                >
                  <span className="w-4 text-center font-mono text-xs font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <Avatar className="h-7 w-7">
                    <AvatarImage
                      src={"avatar_url" in r ? (r.avatar_url ?? undefined) : undefined}
                    />
                    <AvatarFallback className="bg-surface-2 text-[10px] font-semibold">
                      {initials(r.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">{r.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {r.hires} hires · {r.submissions} submissions
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-primary/30 bg-primary/10 text-[10px] text-primary"
                  >
                    {r.hires} Hires
                  </Badge>
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
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Jump in
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {canAccessFeature(accessIdentity, "requirements") && (
                  <Link
                    to="/requirements"
                    className="group rounded-lg border border-border bg-surface/40 p-3 transition-all hover:border-primary/40 hover:bg-muted/40"
                  >
                    <div className="text-xs font-semibold text-foreground group-hover:text-primary">
                      Requisitions
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Review active job roles, client details, and parsed job descriptions.
                    </p>
                  </Link>
                )}

                {canAccessFeature(accessIdentity, "candidates") && (
                  <Link
                    to="/candidates"
                    className="group rounded-lg border border-border bg-surface/40 p-3 transition-all hover:border-primary/40 hover:bg-muted/40"
                  >
                    <div className="text-xs font-semibold text-foreground group-hover:text-primary">
                      Bench Candidates
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Browse candidate bench and review candidate profiles.
                    </p>
                  </Link>
                )}

                {canAccessFeature(accessIdentity, "submissions") && (
                  <Link
                    to="/submissions/board"
                    className="group rounded-lg border border-border bg-surface/40 p-3 transition-all hover:border-primary/40 hover:bg-muted/40"
                  >
                    <div className="text-xs font-semibold text-foreground group-hover:text-primary">
                      Submissions Board
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Track candidate submission stages from Submitted to Hired.
                    </p>
                  </Link>
                )}
              </CardContent>
            </Card>

            {/* Your Activity Card */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-primary" /> Your Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(activity ?? []).slice(0, 5).map((a) => {
                  const item = formatActivityItem(a);
                  return (
                    <div
                      key={a.id}
                      className="flex items-start gap-2.5 text-xs pb-2.5 border-b border-border/50 last:border-0 last:pb-0"
                    >
                      <div className="rounded-full bg-primary/10 p-1.5 text-primary shrink-0 mt-0.5">
                        <FileText className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-foreground text-xs">{item.title}</p>
                          <span className="font-mono text-[10px] text-muted-foreground shrink-0">
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
