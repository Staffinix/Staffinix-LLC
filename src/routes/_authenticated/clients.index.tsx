import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
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
import { listClients } from "@/lib/clients.functions";
import {
  CRM_STATUSES,
  CRM_TIERS,
  STATUS_LABEL,
  STATUS_STYLES,
  TIER_LABEL,
  TIER_STYLES,
} from "@/lib/crm-constants";
import { Plus, Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/clients/")({
  head: () => ({
    meta: [
      { title: "Clients — Staffinix" },
      {
        name: "description",
        content: "Manage client accounts, industries, tiers and relationships.",
      },
    ],
  }),
  component: ClientsListPage,
});

function ClientsListPage() {
  const listFn = useServerFn(listClients);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [tier, setTier] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const query = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: status !== "all" ? (status as (typeof CRM_STATUSES)[number]) : undefined,
      tier: tier !== "all" ? (tier as (typeof CRM_TIERS)[number]) : undefined,
      page,
      page_size: pageSize,
    }),
    [search, status, tier, page],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["clients", query],
    queryFn: () => listFn({ data: query }),
    placeholderData: (p) => p,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="flex min-h-screen flex-col">
      <AppTopbar title="Clients" />
      <div className="flex-1 space-y-6 p-6">
        <PageHeader
          title="Clients"
          description="Companies you place candidates with."
          actions={
            <Button onClick={() => navigate({ to: "/clients/new" })}>
              <Plus className="mr-2 h-4 w-4" /> New client
            </Button>
          }
        />

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, contact, industry or location..."
              className="pl-8"
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {CRM_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={tier}
            onValueChange={(v) => {
              setTier(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tiers</SelectItem>
              {CRM_TIERS.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIER_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : !data?.rows.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No clients found.
                  </TableCell>
                </TableRow>
              ) : (
                data.rows.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => navigate({ to: "/clients/$id", params: { id: c.id } })}
                  >
                    <TableCell className="font-medium">
                      <Link
                        to="/clients/$id"
                        params={{ id: c.id }}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.industry ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.contact_name ?? "—"}
                      {c.contact_email && <div className="text-xs">{c.contact_email}</div>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[c.city, c.state, c.country].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("border", STATUS_STYLES[c.status])}>
                        {STATUS_LABEL[c.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {c.tier ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "border",
                            TIER_STYLES[c.tier] || "bg-primary/10 text-primary border-primary/20",
                          )}
                        >
                          {TIER_LABEL[c.tier] || c.tier}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {isFetching && <Loader2 className="inline h-3 w-3 animate-spin" />} {data?.total ?? 0}{" "}
            total
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
