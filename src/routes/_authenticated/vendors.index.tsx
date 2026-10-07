import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
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
import { exportVendors, importVendors, listVendors } from "@/lib/vendors.functions";
import { createVendorCsv, parseVendorCsv } from "@/lib/vendor-csv";
import {
  CRM_STATUSES,
  CRM_TIERS,
  STATUS_LABEL,
  STATUS_STYLES,
  TIER_LABEL,
  TIER_STYLES,
} from "@/lib/crm-constants";
import { Plus, Search, Loader2, ChevronLeft, ChevronRight, Download, Upload } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/vendors/")({
  head: () => ({
    meta: [
      { title: "Vendors — Staffinix" },
      { name: "description", content: "Manage vendor partners, tiers and payment terms." },
    ],
  }),
  component: VendorsListPage,
});

function VendorsListPage() {
  const listFn = useServerFn(listVendors);
  const exportFn = useServerFn(exportVendors);
  const importFn = useServerFn(importVendors);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);
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
    queryKey: ["vendors", query],
    queryFn: () => listFn({ data: query }),
    placeholderData: (p) => p,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  const importMutation = useMutation({
    mutationFn: (rows: ReturnType<typeof parseVendorCsv>) => importFn({ data: { rows } }),
    onSuccess: ({ imported }) => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast.success(`${imported} vendor${imported === 1 ? "" : "s"} imported`);
    },
  });

  const exportMutation = useMutation({
    mutationFn: () => exportFn(),
    onSuccess: (rows) => {
      const blob = new Blob(["\uFEFF", createVendorCsv(rows)], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `vendors-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`${rows.length} vendor${rows.length === 1 ? "" : "s"} exported`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Export failed"),
  });

  const handleImportFile = async (file: File) => {
    if (file.size > 1024 * 1024) throw new Error("CSV file must be 1 MB or smaller.");
    const rows = parseVendorCsv(await file.text());
    if (rows.length > 1000) throw new Error("A single import can contain at most 1,000 vendors.");
    await importMutation.mutateAsync(rows);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <AppTopbar title="Vendors" />
      <div className="flex-1 space-y-6 p-6">
        <PageHeader
          title="Vendors"
          description="Sourcing partners and preferred vendors."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  try {
                    await handleImportFile(file);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Import failed");
                  } finally {
                    input.value = "";
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={() => importInputRef.current?.click()}
                disabled={importMutation.isPending}
              >
                {importMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Import CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => exportMutation.mutate()}
                disabled={exportMutation.isPending}
              >
                {exportMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Export CSV
              </Button>
              <Button onClick={() => navigate({ to: "/vendors/new" })}>
                <Plus className="mr-2 h-4 w-4" /> New vendor
              </Button>
            </div>
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
              placeholder="Search by name, contact or location..."
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
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Terms</TableHead>
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
                    No vendors found.
                  </TableCell>
                </TableRow>
              ) : (
                data.rows.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => navigate({ to: "/vendors/$id", params: { id: c.id } })}
                  >
                    <TableCell className="font-medium">
                      <Link
                        to="/vendors/$id"
                        params={{ id: c.id }}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-xs text-foreground">
                        {c.contact_name || "—"}
                        {c.contact_role && (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {c.contact_role}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex flex-col gap-0.5 mt-0.5">
                        {c.contact_email && <span>{c.contact_email}</span>}
                        {c.contact_phone && <span>{c.contact_phone}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[c.city, c.state, c.country].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.payment_terms_days != null ? `Net ${c.payment_terms_days}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("border", STATUS_STYLES[c.status])}>
                        {STATUS_LABEL[c.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {c.tier ? (
                        <Badge variant="outline" className={cn("border", TIER_STYLES[c.tier])}>
                          {TIER_LABEL[c.tier]}
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
