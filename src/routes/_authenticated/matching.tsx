import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BrainCircuit,
  BriefcaseBusiness,
  CircleAlert,
  CircleCheck,
  ChevronDown,
  FileSearch,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  generateMatchRationale,
  listMatchingRequirements,
  matchCandidatesForRequirement,
} from "@/lib/matching.functions";
import { buildMatchingVisaOptions, matchesSelectedVisas } from "@/lib/matching-visa-filter";

type MatchingSearch = { reqId?: string; candidateId?: string };
type Rationale = Awaited<ReturnType<typeof generateMatchRationale>>;

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
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [minimumScore, setMinimumScore] = useState("0");
  const [technologyFilter, setTechnologyFilter] = useState("all");
  const [visaFilters, setVisaFilters] = useState<string[]>([]);
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [constraintFilter, setConstraintFilter] = useState("all");
  const [matchLevelFilter, setMatchLevelFilter] = useState("all");
  const [resumeFilter, setResumeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("score_desc");
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [rationales, setRationales] = useState<Record<string, Rationale>>({});

  const requirementsFn = useServerFn(listMatchingRequirements);
  const matchFn = useServerFn(matchCandidatesForRequirement);
  const rationaleFn = useServerFn(generateMatchRationale);
  const requirementsQuery = useQuery({
    queryKey: ["matching-requirements"],
    queryFn: () => requirementsFn(),
  });
  const matchQuery = useQuery({
    queryKey: ["match-candidates", reqId, candidateId],
    queryFn: () =>
      matchFn({ data: { requirement_id: reqId!, candidate_id: candidateId, limit: 250 } }),
    enabled: Boolean(reqId),
  });
  const rationaleMutation = useMutation({
    mutationFn: (candidateIdToAnalyze: string) =>
      rationaleFn({ data: { requirement_id: reqId!, candidate_id: candidateIdToAnalyze } }),
    onSuccess: (rationale, candidateIdToAnalyze) =>
      setRationales((current) => ({ ...current, [candidateIdToAnalyze]: rationale })),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "AI analysis could not be generated."),
  });

  const allRows = useMemo(() => matchQuery.data?.rows ?? [], [matchQuery.data?.rows]);
  const optionValues = useMemo(
    () => ({
      technologies: unique(allRows.map((row) => row.candidate.primary_technology)),
      visas: buildMatchingVisaOptions(allRows.map((row) => row.candidate.visa_status)),
      availability: unique(allRows.map((row) => row.candidate.availability)),
    }),
    [allRows],
  );
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = allRows.filter((row) => {
      const candidateText = [
        row.candidate.first_name,
        row.candidate.last_name,
        row.candidate.current_title,
        row.candidate.required_job,
        row.candidate.primary_technology,
        row.candidate.location,
        ...row.matched_skills,
        ...row.matched_terms,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (!query || candidateText.includes(query)) &&
        row.scores.overall >= Number(minimumScore) &&
        (technologyFilter === "all" ||
          row.candidate.primary_technology === technologyFilter ||
          row.matched_skills.includes(technologyFilter)) &&
        matchesSelectedVisas(row.candidate.visa_status, visaFilters) &&
        (availabilityFilter === "all" || row.candidate.availability === availabilityFilter) &&
        (constraintFilter === "all" || constraintFilter === row.eligibility) &&
        (matchLevelFilter === "all" || row.match_level === matchLevelFilter) &&
        (resumeFilter === "all" ||
          (resumeFilter === "yes" && row.candidate.has_resume) ||
          (resumeFilter === "no" && !row.candidate.has_resume))
      );
    });
    return filtered.sort((a, b) => {
      if (sortOrder === "score_asc") return a.scores.overall - b.scores.overall;
      if (sortOrder === "experience")
        return (b.candidate.experience_years ?? -1) - (a.candidate.experience_years ?? -1);
      if (sortOrder === "skills")
        return (
          b.matched_skills.length - a.matched_skills.length || b.scores.overall - a.scores.overall
        );
      return b.scores.overall - a.scores.overall;
    });
  }, [
    allRows,
    availabilityFilter,
    constraintFilter,
    minimumScore,
    matchLevelFilter,
    resumeFilter,
    search,
    technologyFilter,
    visaFilters,
    sortOrder,
  ]);

  async function refreshMatches() {
    const result = await matchQuery.refetch();
    if (result.isError) toast.error("Matches could not be refreshed.");
    else toast.success("Candidate matches refreshed.");
  }

  return (
    <>
      <AppTopbar title="Candidate Matching" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${matchQuery.isFetching ? "animate-spin" : ""}`}
              />
              Refresh matches
            </Button>
          )}
        </div>

        <PageHeader
          title="AI Candidate Matching"
          description="Rank authorized candidates using skills, domain relevance, experience, work authorization, location, resume evidence, and semantic similarity."
        />

        <Card className="border-border bg-card">
          <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(280px,1fr)_auto] lg:items-end">
            <label className="space-y-2 text-sm font-medium">
              Select an open requisition
              <Select
                value={reqId ?? ""}
                onValueChange={(value) =>
                  navigate({ to: "/matching", search: { reqId: value }, replace: true })
                }
                disabled={requirementsQuery.isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a requisition to run matching" />
                </SelectTrigger>
                <SelectContent>
                  {(requirementsQuery.data ?? []).map((requirement) => (
                    <SelectItem key={requirement.id} value={requirement.id}>
                      {requirement.title}
                      {requirement.primary_technology ? ` · ${requirement.primary_technology}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {reqId && matchQuery.data && (
              <div className="text-xs text-muted-foreground lg:text-right">
                <p>{allRows.length} candidates scored</p>
                <p>{rows.length} match current filters</p>
              </div>
            )}
          </CardContent>
        </Card>

        {!reqId ? (
          <StateCard message="Choose a requisition above to rank candidates." />
        ) : matchQuery.isLoading ? (
          <StateCard loading message="Analyzing candidate data and resume evidence…" />
        ) : matchQuery.isError ? (
          <StateCard
            error
            message={
              matchQuery.error instanceof Error
                ? matchQuery.error.message
                : "Candidate matches could not be loaded."
            }
          />
        ) : (
          <>
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{matchQuery.data?.requirement.title}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {matchQuery.data?.requirement.primary_technology || "Technology not specified"}
                  {matchQuery.data?.requirement.location
                    ? ` · ${matchQuery.data.requirement.location}`
                    : ""}
                </p>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="relative md:col-span-2 xl:col-span-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, role, skill, location"
                    className="pl-9"
                    aria-label="Search matched candidates"
                  />
                </div>
                <FilterSelect
                  value={minimumScore}
                  onChange={setMinimumScore}
                  label="Minimum match"
                  options={[
                    ["0", "Any score"],
                    ["40", "40% and above"],
                    ["60", "60% and above"],
                    ["75", "75% and above"],
                  ]}
                />
                <FilterSelect
                  value={technologyFilter}
                  onChange={setTechnologyFilter}
                  label="Technology"
                  options={[
                    ["all", "All technologies"],
                    ...optionValues.technologies.map((value) => [value, value]),
                  ]}
                />
                <VisaMultiSelect
                  values={visaFilters}
                  onChange={setVisaFilters}
                  options={optionValues.visas}
                />
                <FilterSelect
                  value={availabilityFilter}
                  onChange={setAvailabilityFilter}
                  label="Availability"
                  options={[
                    ["all", "Any availability"],
                    ...optionValues.availability.map((value) => [value, value]),
                  ]}
                />
                <FilterSelect
                  value={constraintFilter}
                  onChange={setConstraintFilter}
                  label="Constraints"
                  options={[
                    ["all", "All eligibility results"],
                    ["meets_minimum", "Meets minimum"],
                    ["needs_review", "Needs review"],
                    ["hard_constraint_not_met", "Hard constraint not met"],
                  ]}
                />
                <FilterSelect
                  value={matchLevelFilter}
                  onChange={setMatchLevelFilter}
                  label="Match level"
                  options={[
                    ["all", "All match levels"],
                    ["excellent", "Excellent match"],
                    ["strong", "Strong match"],
                    ["good", "Good match"],
                    ["partial", "Partial match"],
                    ["low", "Low match"],
                  ]}
                />
                <FilterSelect
                  value={resumeFilter}
                  onChange={setResumeFilter}
                  label="Resume"
                  options={[
                    ["all", "With or without resume"],
                    ["yes", "Resume text available"],
                    ["no", "No resume text"],
                  ]}
                />
                <FilterSelect
                  value={sortOrder}
                  onChange={setSortOrder}
                  label="Sort matches"
                  options={[
                    ["score_desc", "Highest score first"],
                    ["score_asc", "Lowest score first"],
                    ["experience", "Most experience"],
                    ["skills", "Most matched skills"],
                  ]}
                />
              </CardContent>
            </Card>

            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-4 text-xs text-muted-foreground">
                Matching is recruiter decision support, not an automated hiring decision. Review
                source records and interview evidence before advancing or rejecting a candidate.
              </CardContent>
            </Card>

            <div className="grid gap-4">
              {rows.map((row) => {
                const rationale = rationales[row.candidate.id];
                const analyzing =
                  rationaleMutation.isPending && rationaleMutation.variables === row.candidate.id;
                return (
                  <Card key={row.candidate.id} className="border-border bg-card">
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <CardTitle className="text-base">
                            {row.candidate.first_name} {row.candidate.last_name}
                          </CardTitle>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.candidate.current_title || "Role not recorded"}
                            {row.candidate.current_employer
                              ? ` at ${row.candidate.current_employer}`
                              : ""}
                          </p>
                        </div>
                        <Badge className="text-sm">
                          <Sparkles className="mr-1 h-3.5 w-3.5" /> {row.scores.overall}% match
                        </Badge>
                        <Badge variant="outline">{matchLevelLabel(row.match_level)}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                        <Detail
                          icon={BriefcaseBusiness}
                          value={
                            row.candidate.primary_technology ||
                            row.candidate.required_job ||
                            "Technology not recorded"
                          }
                        />
                        <Detail
                          icon={MapPin}
                          value={row.candidate.location || "Location not recorded"}
                        />
                        <Detail
                          icon={FileSearch}
                          value={
                            row.candidate.has_resume
                              ? "Resume evidence available"
                              : "No extracted resume text"
                          }
                        />
                        <Detail
                          icon={BrainCircuit}
                          value={
                            row.scores.semantic == null
                              ? "Structured-data match"
                              : `${row.scores.semantic}% semantic similarity`
                          }
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                        <Score label="Skills" value={row.scores.skill} />
                        <Score label="Domain" value={row.scores.domain} />
                        <Score label="Experience" value={row.scores.experience} />
                        <Score label="Visa" value={row.scores.visa} />
                        <Score label="Location" value={row.scores.location} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className={
                            row.hard_constraints.passed
                              ? "border-emerald-500/30 text-emerald-600"
                              : "border-amber-500/30 text-amber-600"
                          }
                        >
                          {row.eligibility === "meets_minimum" ? (
                            <CircleCheck className="mr-1 h-3 w-3" />
                          ) : (
                            <CircleAlert className="mr-1 h-3 w-3" />
                          )}
                          {eligibilityLabel(row.eligibility)}
                        </Badge>
                        {row.matched_skills.map((skill) => (
                          <Badge key={skill} variant="secondary">
                            {skill}
                          </Badge>
                        ))}
                        {row.matched_terms
                          .filter(
                            (term) =>
                              !row.matched_skills.some((skill) => skill.toLowerCase() === term),
                          )
                          .slice(0, 6)
                          .map((term) => (
                            <Badge key={term} variant="outline">
                              {term}
                            </Badge>
                          ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{row.summary}</p>
                      {(row.missing_required_skills.length > 0 ||
                        row.missing_preferred_skills.length > 0) && (
                        <div className="space-y-1 text-xs text-muted-foreground">
                          {row.missing_required_skills.length > 0 && (
                            <p>
                              Missing required evidence: {row.missing_required_skills.join(", ")}
                            </p>
                          )}
                          {row.missing_preferred_skills.length > 0 && (
                            <p>Preferred gaps: {row.missing_preferred_skills.join(", ")}</p>
                          )}
                        </div>
                      )}
                      {!row.hard_constraints.passed && (
                        <p className="text-xs text-muted-foreground">
                          {row.hard_constraints.reasons.join(" · ")}
                        </p>
                      )}
                      {rationale && (
                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
                          <div className="mb-2 flex items-center gap-2 font-medium">
                            <BrainCircuit className="h-4 w-4 text-primary" /> AI recruiter analysis{" "}
                            <Badge variant="outline">{rationale.verdict}</Badge>
                          </div>
                          <p className="text-muted-foreground">{rationale.recommendation}</p>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <EvidenceList title="Strengths" items={rationale.strengths} />
                            <EvidenceList title="Gaps to verify" items={rationale.gaps} />
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedMatchId(row.candidate.id)}
                        >
                          View match details
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => rationaleMutation.mutate(row.candidate.id)}
                          disabled={analyzing}
                        >
                          {analyzing ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <BrainCircuit className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          {rationale ? "Refresh AI analysis" : "Analyze with AI"}
                        </Button>
                        <Button asChild size="sm">
                          <Link to="/candidates/$id" params={{ id: row.candidate.id }}>
                            View candidate
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {rows.length === 0 && (
                <StateCard
                  message={
                    allRows.length === 0
                      ? "No candidate profiles are available within your current access scope."
                      : constraintFilter === "meets_minimum"
                        ? "No candidates currently satisfy all confirmed minimum requirements."
                        : "No candidates match selected filters."
                  }
                />
              )}
            </div>
            <MatchDetailsDialog
              row={allRows.find((row) => row.candidate.id === selectedMatchId) ?? null}
              open={Boolean(selectedMatchId)}
              onOpenChange={(open) => !open && setSelectedMatchId(null)}
            />
          </>
        )}
      </main>
    </>
  );
}

function matchLevelLabel(level: string) {
  return `${level.charAt(0).toUpperCase()}${level.slice(1)} match`;
}

function eligibilityLabel(value: string) {
  if (value === "meets_minimum") return "Meets minimum";
  if (value === "hard_constraint_not_met") return "Hard constraint not met";
  return "Needs review";
}

function MatchDetailsDialog({
  row,
  open,
  onOpenChange,
}: {
  row: Awaited<ReturnType<typeof matchCandidatesForRequirement>>["rows"][number] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {row ? `${row.candidate.first_name} ${row.candidate.last_name}` : "Match details"}
          </DialogTitle>
          <DialogDescription>
            Transparent score factors and the candidate evidence used for this ranking.
          </DialogDescription>
        </DialogHeader>
        {row && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{row.scores.overall}% match</Badge>
              <Badge variant="outline">{matchLevelLabel(row.match_level)}</Badge>
              <Badge variant="outline">{eligibilityLabel(row.eligibility)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{row.summary}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {row.score_breakdown.map((factor) => (
                <Score key={factor.key} label={factor.label} value={factor.score} />
              ))}
            </div>
            <EvidenceList title="Matched required skills" items={row.matched_required_skills} />
            <EvidenceList title="Missing required evidence" items={row.missing_required_skills} />
            <EvidenceList title="Matched preferred skills" items={row.matched_preferred_skills} />
            <EvidenceList title="Preferred gaps" items={row.missing_preferred_skills} />
            <EvidenceList title="Hard-constraint findings" items={row.hard_constraints.reasons} />
            <EvidenceList title="Items needing verification" items={row.review_notes} />
            <div className="flex justify-end">
              <Button asChild>
                <Link to="/candidates/$id" params={{ id: row.candidate.id }}>
                  Open candidate profile
                </Link>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function unique(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: string[][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map(([optionValue, optionLabel]) => (
          <SelectItem key={optionValue} value={optionValue}>
            {optionLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function VisaMultiSelect({
  values,
  onChange,
  options,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: string[];
}) {
  const label =
    values.length === 0
      ? "All visa types"
      : values.length <= 2
        ? values.join(", ")
        : `${values.length} visa types selected`;

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between px-3 font-normal"
          aria-label="Filter by visa types"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        <DropdownMenuCheckboxItem
          checked={values.length === 0}
          onCheckedChange={() => onChange([])}
          onSelect={(event) => event.preventDefault()}
        >
          All visa types
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option}
            checked={values.includes(option)}
            onCheckedChange={() => toggle(option)}
            onSelect={(event) => event.preventDefault()}
          >
            {option}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Detail({ icon: Icon, value }: { icon: typeof MapPin; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/70 p-2.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="truncate">{value}</span>
    </div>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/70 p-2.5">
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function EvidenceList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium">{title}</p>
      {items.length ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {items.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">None returned.</p>
      )}
    </div>
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

