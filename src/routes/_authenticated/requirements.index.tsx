import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  SheetFooter,
} from "@/components/ui/sheet";
import { listRequirements } from "@/lib/requirements.functions";
import {
  REQ_STATUSES,
  REQ_PRIORITIES,
  STATUS_LABEL,
  PRIORITY_LABEL,
  STATUS_STYLES,
  PRIORITY_STYLES,
  formatRate,
} from "@/lib/requirements-constants";
import {
  FileText,
  Plus,
  Search,
  Loader2,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Eye,
  Sparkles,
  ArrowUpDown,
  DollarSign,
  Building,
  Briefcase,
  ShieldCheck,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const getStatusStyle = (s?: string) =>
  (s && (STATUS_STYLES as Record<string, string>)[s]) || STATUS_STYLES.open;
const getStatusLabel = (s?: string) =>
  (s && (STATUS_LABEL as Record<string, string>)[s]) || STATUS_LABEL.open;
const getPriorityStyle = (p?: string) =>
  (p && (PRIORITY_STYLES as Record<string, string>)[p]) || PRIORITY_STYLES.medium;
const getPriorityLabel = (p?: string) =>
  (p && (PRIORITY_LABEL as Record<string, string>)[p]) || PRIORITY_LABEL.medium;

export const Route = createFileRoute("/_authenticated/requirements/")({
  head: () => ({ meta: [{ title: "Requisitions — Staffinix" }] }),
  component: RequisitionsListPage,
});

type RequirementListItem = Awaited<ReturnType<typeof listRequirements>>["rows"][number];

function RequisitionsListPage() {
  const listFn = useServerFn(listRequirements);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("created_desc");
  const [page, setPage] = useState(1);
  const [reviewReq, setReviewReq] = useState<RequirementListItem | null>(null);
  const pageSize = 20;

  const query = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: status !== "all" ? [status as (typeof REQ_STATUSES)[number]] : undefined,
      priority: priority !== "all" ? [priority as (typeof REQ_PRIORITIES)[number]] : undefined,
      page,
      page_size: pageSize,
    }),
    [search, status, priority, page],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["requirements", query],
    queryFn: () => listFn({ data: query }),
    placeholderData: (prev) => prev,
  });

  const totalCount = data?.total ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const filteredRequirements = useMemo(() => {
    const rows = data?.rows ?? [];
    return [...rows].sort((a, b) => {
      if (sortBy === "created_desc")
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "created_asc")
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "rate_desc") return (b.rate_max || 0) - (a.rate_max || 0);
      if (sortBy === "rate_asc") return (a.rate_max || 0) - (b.rate_max || 0);
      return 0;
    });
  }, [data?.rows, sortBy]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppTopbar title="Requisitions" />

      <div className="flex-1 space-y-4 p-6">
        <PageHeader
          title="Requisitions & JDs"
          description="Manage client job requirements, rate targets, required tech stacks, and track candidate pipeline fulfillment."
          actions={
            <Button
              asChild
              className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-primary-foreground shadow-md transition-all duration-200"
            >
              <Link to="/requirements/new">
                <Plus className="h-4 w-4" /> Add Requisition
              </Link>
            </Button>
          }
        />

        {/* Global Toolbar Filters */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/60 p-4 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by title, technology, or client..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9 bg-surface text-xs"
              />
            </div>

            <Select
              value={status}
              onValueChange={(val) => {
                setStatus(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px] bg-surface text-xs h-9">
                <SelectValue placeholder="Status: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {REQ_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={priority}
              onValueChange={(val) => {
                setPriority(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px] bg-surface text-xs h-9">
                <SelectValue placeholder="Priority: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                {REQ_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[160px] bg-surface text-xs h-9">
                <ArrowUpDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_desc">Newest First</SelectItem>
                <SelectItem value="created_asc">Oldest First</SelectItem>
                <SelectItem value="rate_desc">Highest Rate</SelectItem>
                <SelectItem value="rate_asc">Lowest Rate</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Requirements Table Grid */}
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredRequirements.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center p-6 space-y-3">
              <FileText className="h-10 w-10 text-muted-foreground stroke-[1.5]" />
              <div>
                <p className="text-sm font-medium text-foreground">No requisitions found</p>
                <p className="text-xs text-muted-foreground">
                  Try adjusting your search filters or add a new job requisition.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/80 bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[280px]">Job Title & Domain</TableHead>
                  <TableHead>Client & Vendor</TableHead>
                  <TableHead>Location / Mode</TableHead>
                  <TableHead>Visa</TableHead>
                  <TableHead>Target Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequirements.map((r) => (
                  <TableRow
                    key={r.id}
                    className="border-b border-border/60 hover:bg-accent/40 cursor-pointer transition-colors"
                    onClick={() => setReviewReq(r)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-foreground hover:text-primary transition-colors">
                          {r.title}
                        </span>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {r.primary_technology && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 font-normal bg-surface border border-border"
                            >
                              {r.primary_technology}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">
                        <p className="font-medium text-foreground">{r.client_name || "Direct"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.vendor_name || "Direct Sourcing"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[120px]">
                          {r.location || "Remote"} ({r.work_mode || "remote"})
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-surface font-mono font-normal"
                      >
                        {r.visa_types?.join(", ") || "Any"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-foreground">
                      {formatRate(r.rate_min, r.rate_max, r.rate_type, r.currency) ??
                        "Not specified"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-normal capitalize text-[10px]",
                          getStatusStyle(r.status),
                        )}
                      >
                        {getStatusLabel(r.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-normal capitalize text-[10px]",
                          getPriorityStyle(r.priority),
                        )}
                      >
                        {getPriorityLabel(r.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        {r.status === "open" && (
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
                          >
                            <Link to="/matching" search={{ reqId: r.id }}>
                              <Sparkles className="h-3.5 w-3.5" />
                              AI Matching
                            </Link>
                          </Button>
                        )}
                        <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                          <Link to="/requirements/$id" params={{ id: r.id }}>
                            <Eye className="h-3.5 w-3.5" />
                            Review
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Slide-Over Review Drawer */}
        <Sheet open={!!reviewReq} onOpenChange={(open) => !open && setReviewReq(null)}>
          <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-6 space-y-6">
            {reviewReq && (
              <>
                <SheetHeader className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]", getStatusStyle(reviewReq.status))}
                    >
                      {getStatusLabel(reviewReq.status)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]", getPriorityStyle(reviewReq.priority))}
                    >
                      {getPriorityLabel(reviewReq.priority)} Priority
                    </Badge>
                  </div>
                  <SheetTitle className="text-xl font-bold text-foreground">
                    {reviewReq.title}
                  </SheetTitle>
                  <SheetDescription className="text-xs text-muted-foreground">
                    Requisition ID: {reviewReq.id} · Created{" "}
                    {formatDistanceToNow(new Date(reviewReq.created_at), { addSuffix: true })}
                  </SheetDescription>
                </SheetHeader>

                {/* Key Overview Grid */}
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface p-4 text-xs">
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Building className="h-3.5 w-3.5 text-primary" /> Client:
                    </span>
                    <p className="font-semibold text-foreground mt-0.5">{reviewReq.client_name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-primary" /> Location:
                    </span>
                    <p className="font-semibold text-foreground mt-0.5">
                      {reviewReq.location || "Remote"} ({reviewReq.work_mode || "remote"})
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5 text-primary" /> Primary technology:
                    </span>
                    <p className="font-semibold text-foreground mt-0.5">
                      {reviewReq.primary_technology || "Not specified"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5 text-primary" /> Rate:
                    </span>
                    <p className="font-semibold text-foreground mt-0.5">
                      {formatRate(
                        reviewReq.rate_min,
                        reviewReq.rate_max,
                        reviewReq.rate_type,
                        reviewReq.currency,
                      ) ?? "Not specified"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Visa Required:
                    </span>
                    <p className="font-semibold text-foreground mt-0.5">
                      {reviewReq.visa_types?.join(", ") || "Any"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5 text-primary" /> Experience:
                    </span>
                    <p className="font-semibold text-foreground mt-0.5">
                      {reviewReq.min_experience_years == null &&
                      reviewReq.max_experience_years == null
                        ? "Not specified"
                        : `${reviewReq.min_experience_years ?? 0}–${reviewReq.max_experience_years ?? "any"} years`}
                    </p>
                  </div>
                </div>

                {/* Vendor Details Box */}
                <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-xs">
                  <h4 className="font-semibold text-foreground flex items-center gap-1.5">
                    Vendor Partner
                  </h4>
                  <p className="text-muted-foreground">
                    {reviewReq.vendor_name || "Direct sourcing"}
                  </p>
                </div>

                {/* Required Skills */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-foreground">Primary Required Skills</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {reviewReq.primary_technology ? (
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                        {reviewReq.primary_technology}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not specified</span>
                    )}
                  </div>
                </div>

                <SheetFooter className="pt-4 border-t border-border flex-col sm:flex-row gap-2">
                  <Button
                    className="w-full sm:flex-1 gap-2 text-xs"
                    onClick={() => {
                      setReviewReq(null);
                      navigate({ to: "/matching" });
                    }}
                  >
                    <Sparkles className="h-4 w-4" /> Go To AI Matching
                  </Button>
                </SheetFooter>
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* Pagination */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {totalCount > 0 ? (page - 1) * pageSize + 1 : 0}–
            {Math.min(page * pageSize, totalCount)} of {totalCount}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <div className="rounded-full bg-primary/10 p-3 text-primary">
        <FileText className="h-5 w-5" />
      </div>
      <div>
        <p className="font-medium">No requisitions match filters</p>
        <p className="text-sm text-muted-foreground">
          Try clearing your search or add a new requisition.
        </p>
      </div>
      <Button size="sm" asChild>
        <Link to="/requirements/new">
          <Plus className="mr-1.5 h-4 w-4" /> New Requisition
        </Link>
      </Button>
    </div>
  );
}
