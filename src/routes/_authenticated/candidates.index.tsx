import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RecruiterPicker } from "@/components/candidates/recruiter-picker";
import {
  Loader2,
  Plus,
  Eye,
  Briefcase,
  Zap,
  Globe,
  Cpu,
  Mail,
  Phone,
  MapPin,
  Sparkles,
  Send,
} from "lucide-react";
import { listCandidates } from "@/lib/candidates.functions";
import {
  assignCandidatesToRecruiter,
  listEligibleL4Recruiters,
} from "@/lib/candidate-management.functions";
import {
  CANDIDATE_STATUS_LABEL,
  CANDIDATE_STATUS_STYLES,
  AVAILABILITIES,
  AVAILABILITY_LABEL,
  VISA_OPTIONS,
} from "@/lib/candidates-constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/candidates/")({
  head: () => ({ meta: [{ title: "Bench Candidates — Staffinix" }] }),
  component: BenchCandidatesPage,
});

import { useProfile } from "@/hooks/use-profile";
import { useRoleLevel } from "@/hooks/use-role-level";

function BenchCandidatesPage() {
  const { data: profile } = useProfile();
  const { level } = useRoleLevel();
  const isL3orL4 = level === "L3" || level === "L4";
  const isL2 = level === "L2";
  const isL4 = level === "L4";
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [experience, setExperience] = useState<string>("all");
  const [availability, setAvailability] = useState<string>("all");
  const [visa, setVisa] = useState<string>("all");
  const [tech, setTech] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [assignedRecruiter, setAssignedRecruiter] = useState("all");
  const [submissionState, setSubmissionState] = useState("all");
  const [submissionSort, setSubmissionSort] = useState("default");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [recruiterId, setRecruiterId] = useState("");
  const pageSize = 20;

  const listFn = useServerFn(listCandidates);
  const filters = useMemo(() => {
    const [minimumExperience, maximumExperience] =
      experience === "0-3"
        ? [0, 3]
        : experience === "4-7"
          ? [4, 7]
          : experience === "8-10"
            ? [8, 10]
            : experience === "10+"
              ? [10, undefined]
              : [undefined, undefined];

    return {
      search: search || undefined,
      min_experience: minimumExperience,
      max_experience: maximumExperience,
      availability:
        availability !== "all" ? [availability as (typeof AVAILABILITIES)[number]] : undefined,
      visa: visa !== "all" ? [visa] : undefined,
      technology: tech || undefined,
      status:
        status !== "all"
          ? [status as "active" | "submitted" | "placed" | "on_hold" | "inactive"]
          : undefined,
      assigned_to: assignedRecruiter !== "all" ? assignedRecruiter : undefined,
      submission_state:
        submissionState !== "all" ? (submissionState as "submitted" | "unsubmitted") : undefined,
      submission_sort:
        submissionSort !== "default" ? (submissionSort as "asc" | "desc") : undefined,
      page,
      page_size: pageSize,
    };
  }, [
    search,
    experience,
    availability,
    visa,
    tech,
    status,
    assignedRecruiter,
    submissionState,
    submissionSort,
    page,
  ]);

  const list = useQuery({
    queryKey: ["candidates", filters],
    queryFn: () => listFn({ data: filters }),
  });
  const recruitersFn = useServerFn(listEligibleL4Recruiters);
  const recruiters = useQuery({
    queryKey: ["eligible-l4-recruiters"],
    queryFn: () => recruitersFn(),
    enabled: isL2,
  });
  const assignFn = useServerFn(assignCandidatesToRecruiter);
  const assignment = useMutation({
    mutationFn: () => assignFn({ data: { candidateIds: [...selectedIds], recruiterId } }),
    onSuccess: async () => {
      toast.success(`${selectedIds.size} candidate${selectedIds.size === 1 ? "" : "s"} assigned.`);
      setAssignmentOpen(false);
      setRecruiterId("");
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Assignment failed."),
  });
  type CandidateRow = NonNullable<typeof list.data>["rows"][number];
  const [profileCand, setProfileCand] = useState<CandidateRow | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const rows = list.data?.rows ?? [];
  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    page,
    search,
    experience,
    availability,
    visa,
    tech,
    status,
    assignedRecruiter,
    submissionState,
    submissionSort,
  ]);

  const allPageSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const totalBench = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalBench / pageSize));
  const pageRowCount = rows.length;
  const immediateCount = rows.filter((candidate) => candidate.availability === "immediate").length;
  const twoWksCount = rows.filter((candidate) => candidate.availability === "two_weeks").length;
  const uniqueTechCount = new Set(
    rows.map((candidate) => candidate.primary_technology).filter(Boolean),
  ).size;

  const h1bPct = Math.round(
    pageRowCount > 0
      ? (rows.filter((candidate) => candidate.visa_status === "H1B").length / pageRowCount) * 100
      : 0,
  );
  const uscPct = Math.round(
    pageRowCount > 0
      ? (rows.filter((candidate) => candidate.visa_status === "US Citizen").length / pageRowCount) *
          100
      : 0,
  );
  const gcPct = Math.round(
    pageRowCount > 0
      ? (rows.filter((candidate) => candidate.visa_status === "Green Card").length / pageRowCount) *
          100
      : 0,
  );

  const immPct = pageRowCount > 0 ? Math.round((immediateCount / pageRowCount) * 100) : 0;
  const twoWkPct = pageRowCount > 0 ? Math.round((twoWksCount / pageRowCount) * 100) : 0;
  const technologyCounts = Array.from(
    rows.reduce((counts, candidate) => {
      for (const skill of candidate.top_skills) counts.set(skill, (counts.get(skill) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <>
      <AppTopbar title="Bench Candidates" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <PageHeader
          title="Bench Candidates"
          description="Manage consultant bench, availability, technology skill tags, and client submission readiness."
          actions={
            <Button
              size="sm"
              asChild
              className="gap-1.5 text-xs font-semibold bg-primary text-primary-foreground shadow-sm"
            >
              <Link to="/candidates/new">
                <Plus className="h-4 w-4" /> Add New Candidate
              </Link>
            </Button>
          }
        />

        {/* Dynamic Analytics & Bench Insights KPI Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Bench Availability
              </span>
              <div className="rounded p-1 text-emerald-600 bg-emerald-500/10">
                <Zap className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {totalBench}
              </span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                Total Consultants
              </span>
            </div>
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                <span>
                  Immediate on page: <strong className="text-foreground">{immediateCount}</strong>
                </span>
                <span>{immPct}% of this page</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                <div className="bg-emerald-500 h-full" style={{ width: `${immPct}%` }} />
                <div className="bg-amber-500 h-full" style={{ width: `${twoWkPct}%` }} />
                <div
                  className="bg-blue-500 h-full"
                  style={{ width: `${100 - immPct - twoWkPct}%` }}
                />
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-0.5">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Immediate (
                  {immPct}%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> 2 Wks (
                  {twoWkPct}%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" /> 1 Mo (
                  {100 - immPct - twoWkPct}%)
                </span>
              </div>
            </div>
          </Card>

          <Card className="border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Visa Buckets
              </span>
              <div className="rounded p-1 text-purple-500 bg-purple-500/10">
                <Globe className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold tracking-tight text-foreground">{h1bPct}%</span>
              <span className="text-xs text-muted-foreground font-medium">H1B on this page</span>
            </div>
            <div className="space-y-1.5 pt-1">
              <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                <div className="bg-purple-500 h-full" style={{ width: `${h1bPct}%` }} />
                <div className="bg-blue-500 h-full" style={{ width: `${uscPct}%` }} />
                <div className="bg-emerald-500 h-full" style={{ width: `${gcPct}%` }} />
              </div>
              <div className="flex flex-wrap items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-purple-500 inline-block" /> H1B ({h1bPct}
                  %)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" /> USC ({uscPct}%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Green Card (
                  {gcPct}%)
                </span>
              </div>
            </div>
          </Card>

          <Card className="border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Top Tech Stacks
              </span>
              <div className="rounded p-1 text-amber-500 bg-amber-500/10">
                <Cpu className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {uniqueTechCount}
              </span>
              <span className="text-xs text-muted-foreground font-medium">Tech Categories</span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {technologyCounts.map(([technology, count]) => (
                <Badge
                  key={technology}
                  variant="secondary"
                  className="text-[10px] bg-primary/10 text-primary border-primary/20"
                >
                  {technology} ({count})
                </Badge>
              ))}
              {technologyCounts.length === 0 && (
                <span className="text-xs text-muted-foreground">No technology data.</span>
              )}
            </div>
          </Card>
        </div>

        {/* Filters Strip */}
        <Card className="border-border bg-card">
          <CardContent className="grid gap-3 p-4 md:grid-cols-4 xl:grid-cols-8">
            <div className="md:col-span-2 xl:col-span-1">
              <SearchInput
                placeholder="Search candidate name, email, skills…"
                className="text-xs"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                onClear={() => {
                  setSearch("");
                  setPage(1);
                }}
              />
            </div>
            <Select
              value={experience}
              onValueChange={(v) => {
                setExperience(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Any experience" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any experience</SelectItem>
                <SelectItem value="0-3">0–3 Years (Junior)</SelectItem>
                <SelectItem value="4-7">4–7 Years (Mid Level)</SelectItem>
                <SelectItem value="8-10">8–10 Years (Senior)</SelectItem>
                <SelectItem value="10+">10+ Years (Lead / Architect)</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={availability}
              onValueChange={(v) => {
                setAvailability(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Availability" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any availability</SelectItem>
                {AVAILABILITIES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {AVAILABILITY_LABEL[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={visa}
              onValueChange={(v) => {
                setVisa(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Visa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any visa</SelectItem>
                {VISA_OPTIONS.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Candidate status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {Object.entries(CANDIDATE_STATUS_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isL2 && (
              <Select
                value={assignedRecruiter}
                onValueChange={(value) => {
                  setAssignedRecruiter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Assigned L4" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any assigned L4</SelectItem>
                  {(recruiters.data ?? []).map((recruiter) => (
                    <SelectItem key={recruiter.id} value={recruiter.id}>
                      {recruiter.full_name || recruiter.email || "Unnamed recruiter"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isL2 && (
              <Select
                value={submissionState}
                onValueChange={(value) => {
                  setSubmissionState(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Submission state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any submission state</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="unsubmitted">Assigned / unsubmitted</SelectItem>
                </SelectContent>
              </Select>
            )}
            {isL2 && (
              <Select
                value={submissionSort}
                onValueChange={(value) => {
                  setSubmissionSort(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Submission date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Newest candidates</SelectItem>
                  <SelectItem value="desc">Latest submissions</SelectItem>
                  <SelectItem value="asc">Oldest submissions</SelectItem>
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        {/* Pure Tabular Browsing View */}
        <Card className="border-border bg-card shadow-sm">
          {isL2 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
              <p className="text-xs text-muted-foreground">
                {selectedIds.size > 0
                  ? `${selectedIds.size} candidate${selectedIds.size === 1 ? "" : "s"} selected on this page`
                  : "Select candidates on this page to assign or reassign them to an L4 recruiter."}
              </p>
              <Button
                size="sm"
                disabled={selectedIds.size === 0}
                onClick={() => setAssignmentOpen(true)}
              >
                Assign to L4 recruiter
              </Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <Table className="w-full text-sm">
              <TableHeader className="border-b border-border bg-surface">
                <TableRow className="text-center text-xs text-muted-foreground">
                  {isL2 && (
                    <TableHead className="w-10 p-3">
                      <Checkbox
                        aria-label="Select all candidates on this page"
                        checked={allPageSelected}
                        onCheckedChange={(checked) =>
                          setSelectedIds(checked ? new Set(rows.map((row) => row.id)) : new Set())
                        }
                      />
                    </TableHead>
                  )}
                  <TableHead className="p-3 font-semibold text-center">Candidate</TableHead>
                  <TableHead className="p-3 font-semibold text-center">Job Role</TableHead>
                  <TableHead className="p-3 font-semibold text-center">Tech / Skills</TableHead>
                  <TableHead className="p-3 font-semibold text-center">Visa</TableHead>
                  <TableHead className="p-3 font-semibold text-center">Exp</TableHead>
                  <TableHead className="p-3 font-semibold text-center">Location</TableHead>
                  <TableHead className="p-3 font-semibold text-center">Availability</TableHead>
                  <TableHead className="p-3 font-semibold text-center">Status</TableHead>
                  <TableHead className="p-3 font-semibold text-center">Assigned L4</TableHead>
                  <TableHead className="p-3 font-semibold text-center">Submission</TableHead>
                  {!isL3orL4 && (
                    <TableHead className="p-3 font-semibold text-center">AI Match</TableHead>
                  )}
                  <TableHead className="p-3 font-semibold text-center">Profile</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  return (
                    <TableRow
                      key={r.id}
                      className="border-t border-border hover:bg-muted/40 transition-colors text-center"
                    >
                      {isL2 && (
                        <TableCell className="p-3">
                          <Checkbox
                            aria-label={`Select ${r.first_name} ${r.last_name}`}
                            checked={selectedIds.has(r.id)}
                            onCheckedChange={(checked) => {
                              setSelectedIds((current) => {
                                const next = new Set(current);
                                if (checked) next.add(r.id);
                                else next.delete(r.id);
                                return next;
                              });
                            }}
                          />
                        </TableCell>
                      )}
                      <TableCell className="p-3 text-left">
                        <div className="font-semibold text-xs text-foreground">
                          {r.first_name} {r.last_name}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex flex-col gap-0.5 mt-0.5">
                          <span>{r.email}</span>
                          <span>{r.phone}</span>
                        </div>
                      </TableCell>
                      <TableCell className="p-3 text-center font-medium text-xs text-foreground">
                        {r.current_title || "—"}
                      </TableCell>
                      <TableCell className="p-3 text-center">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {r.top_skills.slice(0, 4).map((s) => (
                            <Badge
                              key={s}
                              variant="secondary"
                              className="bg-primary/10 text-[10px] text-primary border-0 font-normal px-1.5 py-0"
                            >
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="p-3 text-xs font-medium text-center">
                        {r.visa_status}
                      </TableCell>
                      <TableCell className="p-3 text-xs font-medium text-center">
                        {r.experience_years} Years
                      </TableCell>
                      <TableCell className="p-3 text-xs text-muted-foreground text-center">
                        {r.location}
                      </TableCell>
                      <TableCell className="p-3 text-xs font-medium text-center">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {AVAILABILITY_LABEL[r.availability as keyof typeof AVAILABILITY_LABEL] ??
                            r.availability}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-3 text-center">
                        <Badge
                          className={cn(
                            "text-[10px]",
                            CANDIDATE_STATUS_STYLES[
                              r.status as keyof typeof CANDIDATE_STATUS_STYLES
                            ],
                          )}
                        >
                          {CANDIDATE_STATUS_LABEL[
                            r.status as keyof typeof CANDIDATE_STATUS_LABEL
                          ] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-3 text-xs text-center">
                        {r.assigned_recruiter?.full_name ||
                          r.assigned_recruiter?.email ||
                          (r.assigned_to ? "Assigned recruiter" : "Unassigned")}
                      </TableCell>
                      <TableCell className="p-3 text-center">
                        {r.latest_submission ? (
                          <div className="space-y-0.5 text-[11px]">
                            <Badge variant="outline" className="capitalize">
                              {r.latest_submission.stage.replaceAll("_", " ")}
                            </Badge>
                            <p className="text-muted-foreground">
                              {r.latest_submission.submitted_at
                                ? new Date(r.latest_submission.submitted_at).toLocaleDateString()
                                : "Draft"}
                            </p>
                            {r.latest_submission.submitted_by_profile && (
                              <p className="max-w-32 truncate text-muted-foreground">
                                by{" "}
                                {r.latest_submission.submitted_by_profile.full_name ||
                                  r.latest_submission.submitted_by_profile.email}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not submitted</span>
                        )}
                      </TableCell>
                      {!isL3orL4 && (
                        <TableCell className="p-3 text-center">
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-[11px] font-bold gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                          >
                            <Link to="/matching" search={{ candidateId: r.id }}>
                              <Sparkles className="h-3 w-3 text-emerald-500" /> Select role
                            </Link>
                          </Button>
                        </TableCell>
                      )}

                      <TableCell className="p-3 text-center">
                        <div className="flex justify-center gap-1.5">
                          {isL4 && (
                            <Button asChild size="sm" className="h-7 px-2.5 text-[11px] gap-1">
                              <Link to="/submissions/new" search={{ candidate_id: r.id }}>
                                <Send className="h-3 w-3" /> Submit
                              </Link>
                            </Button>
                          )}
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-[11px] gap-1"
                          >
                            <Link to="/candidates/$id" params={{ id: r.id }}>
                              <Eye className="h-3 w-3" /> View Profile
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {list.isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={13}
                      className="p-10 text-center text-xs text-muted-foreground"
                    >
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading candidates…
                    </TableCell>
                  </TableRow>
                )}
                {list.isError && (
                  <TableRow>
                    <TableCell
                      colSpan={13}
                      role="alert"
                      className="p-10 text-center text-xs text-destructive"
                    >
                      Candidate data could not be loaded. Please retry in a moment.
                    </TableCell>
                  </TableRow>
                )}
                {!list.isLoading && !list.isError && rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={13}
                      className="p-10 text-center text-xs text-muted-foreground"
                    >
                      No candidates found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border p-3 text-xs text-muted-foreground">
            <span>
              {totalBench} candidates on bench · Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>

        {/* Profile Analysis Drawer */}
        <Sheet open={!!profileCand} onOpenChange={(open) => !open && setProfileCand(null)}>
          <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-6 space-y-6">
            {profileCand && (
              <>
                <SheetHeader className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      className={cn(
                        "text-[10px]",
                        CANDIDATE_STATUS_STYLES[
                          profileCand.status as keyof typeof CANDIDATE_STATUS_STYLES
                        ],
                      )}
                    >
                      {CANDIDATE_STATUS_LABEL[
                        profileCand.status as keyof typeof CANDIDATE_STATUS_LABEL
                      ] ?? profileCand.status}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {profileCand.visa_status}
                    </Badge>
                  </div>
                  <SheetTitle className="text-xl font-bold text-foreground">
                    {profileCand.first_name} {profileCand.last_name}
                  </SheetTitle>
                  <SheetDescription className="text-xs text-muted-foreground">
                    {profileCand.current_title} · {profileCand.experience_years} Years Experience
                  </SheetDescription>
                </SheetHeader>

                <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface p-4 text-xs">
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5 text-primary" /> Email:
                    </span>
                    <p className="font-semibold text-foreground mt-0.5">{profileCand.email}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 text-primary" /> Phone:
                    </span>
                    <p className="font-semibold text-foreground mt-0.5">{profileCand.phone}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-primary" /> Location:
                    </span>
                    <p className="font-semibold text-foreground mt-0.5">{profileCand.location}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5 text-primary" /> Job Role:
                    </span>
                    <p className="font-semibold text-foreground mt-0.5">
                      {profileCand.current_title || "—"}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-foreground">Core Skills</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {profileCand.top_skills.map((skill) => (
                      <Badge key={skill} variant="outline" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                    {profileCand.top_skills.length === 0 && (
                      <span className="text-xs text-muted-foreground">No skills recorded.</span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-foreground">Resume Preview</h4>
                  <div className="rounded-md border border-border bg-card p-4 text-xs font-mono text-muted-foreground leading-normal space-y-1">
                    <p className="font-bold text-foreground">
                      {profileCand.first_name} {profileCand.last_name} — Resume
                    </p>
                    <p>
                      • {profileCand.experience_years}+ years of software development experience.
                    </p>
                    <p>• Core Skills: {profileCand.top_skills.join(", ") || "Not recorded"}</p>
                    <p>
                      • Location: {profileCand.location} | Visa: {profileCand.visa_status}
                    </p>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        <Dialog open={assignmentOpen} onOpenChange={setAssignmentOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm candidate assignment</DialogTitle>
              <DialogDescription>
                Assign or reassign {selectedIds.size} selected candidate
                {selectedIds.size === 1 ? "" : "s"}. This change is recorded in assignment history.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>L4 recruiter</Label>
              <RecruiterPicker
                recruiters={recruiters.data ?? []}
                value={recruiterId}
                onChange={setRecruiterId}
              />
              {recruiterId && (
                <p className="text-xs font-medium text-primary">
                  Selected:{" "}
                  {recruiters.data?.find((item) => item.id === recruiterId)?.full_name ||
                    recruiters.data?.find((item) => item.id === recruiterId)?.email}
                </p>
              )}
              {recruiters.isError && (
                <p role="alert" className="text-xs text-destructive">
                  Eligible recruiters could not be loaded.
                </p>
              )}
              {!recruiters.isLoading && recruiters.data?.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No active L4 recruiters are available in this tenant.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setAssignmentOpen(false)}
                disabled={assignment.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => assignment.mutate()}
                disabled={!recruiterId || selectedIds.size === 0 || assignment.isPending}
              >
                {assignment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm assignment
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Form-Based Candidate Addition Modal */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">Add Bench Candidate</DialogTitle>
              <DialogDescription className="text-xs">
                Fill in candidate details to add them directly to the bench.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setIsAddOpen(false);
              }}
              className="space-y-4 pt-2 text-xs"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>First Name</Label>
                  <Input placeholder="John" className="text-xs" required />
                </div>
                <div className="space-y-1">
                  <Label>Last Name</Label>
                  <Input placeholder="Doe" className="text-xs" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" placeholder="john.doe@tech.io" className="text-xs" required />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input placeholder="+1 (555) 000-0000" className="text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Applied Role</Label>
                  <Input placeholder="React Engineer" className="text-xs" />
                </div>
                <div className="space-y-1">
                  <Label>Visa Status</Label>
                  <Select defaultValue="H1B">
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VISA_OPTIONS.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Experience (Years)</Label>
                  <Input type="number" placeholder="5" className="text-xs" />
                </div>
                <div className="space-y-1">
                  <Label>Location</Label>
                  <Input placeholder="New York, NY" className="text-xs" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Primary Skills (Comma Separated)</Label>
                <Input placeholder="React, Node.js, TypeScript, AWS" className="text-xs" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Save Candidate
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}
