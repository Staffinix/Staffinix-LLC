import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trophy, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { listPlacements } from "@/lib/placements.functions";
import { PLACEMENT_STYLE, type PlacementStatus } from "@/lib/submissions-constants";

export const Route = createFileRoute("/_authenticated/placements")({
  head: () => ({ meta: [{ title: "Placements — Staffinix" }] }),
  component: PlacementsPage,
});

function PlacementsPage() {
  const listFn = useServerFn(listPlacements);
  const { data, isLoading } = useQuery({
    queryKey: ["placements"],
    queryFn: () => listFn({ data: { page: 1, page_size: 100 } }),
  });
  const rows = data?.rows ?? [];

  const activeMargin = rows
    .filter((r) => r.status === "active")
    .reduce((sum, r) => sum + (Number(r.margin) || 0), 0);

  return (
    <>
      <AppTopbar title="Placements" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <PageHeader
          title="Placements"
          description="Every candidate who's on billing. Track start/end, rates, and margin."
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Total placements" value={rows.length.toString()} />
          <StatCard
            label="Active placements"
            value={rows.filter((r) => r.status === "active").length.toString()}
          />
          <StatCard label="Active margin (per hr)" value={`$${activeMargin.toFixed(2)}`} />
        </div>

        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Requirement</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Start / End</TableHead>
                <TableHead>Bill / Pay</TableHead>
                <TableHead>Margin</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    <Trophy className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
                    No placements yet. Move a submission to{" "}
                    <span className="text-foreground">Hired</span> to create one.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm text-foreground">
                      {r.candidate?.first_name} {r.candidate?.last_name}
                      <p className="text-xs text-muted-foreground">
                        {r.candidate?.current_title ?? "—"}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.requirement?.title ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.client?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.start_date ? format(new Date(r.start_date), "MMM d, yyyy") : "—"}
                      <p className="text-xs text-muted-foreground">
                        → {r.end_date ? format(new Date(r.end_date), "MMM d, yyyy") : "open"}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.bill_rate ? `${r.currency ?? "USD"} ${r.bill_rate}` : "—"}
                      <p className="text-xs text-muted-foreground">
                        pay: {r.pay_rate ? `${r.currency ?? "USD"} ${r.pay_rate}` : "—"}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm font-medium text-success">
                      {r.margin != null
                        ? `${r.currency ?? "USD"} ${Number(r.margin).toFixed(2)}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={PLACEMENT_STYLE[r.status as PlacementStatus]}
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
