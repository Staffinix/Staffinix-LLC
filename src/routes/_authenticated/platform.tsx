import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  Check,
  Eye,
  FileText,
  Loader2,
  Pencil,
  UserRoundSearch,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listTenants, updateTenant } from "@/lib/tenancy.functions";
import { getSafeHttpUrl } from "@/lib/safe-url";

const PLANS = ["trial", "starter", "growth", "enterprise"] as const;
const STATUSES = ["active", "trialing", "suspended", "cancelled"] as const;
type TenantPatch = {
  plan?: (typeof PLANS)[number];
  status?: (typeof STATUSES)[number];
  seat_limit?: number;
};

export const Route = createFileRoute("/_authenticated/platform")({
  head: () => ({ meta: [{ title: "Platform Console — Staffinix" }] }),
  component: PlatformConsole,
});

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function domainLabel(website: string | null, slug: string) {
  if (!website) return `${slug}.com`;
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return website.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

function Detail({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value || "Not recorded"}</p>
    </div>
  );
}

function PlatformConsole() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listTenants);
  const updateFn = useServerFn(updateTenant);
  const [seatEditorId, setSeatEditorId] = useState<string | null>(null);
  const [seatDraft, setSeatDraft] = useState(1);
  const [detailTenantId, setDetailTenantId] = useState<string | null>(null);
  const tenantsQuery = useQuery({
    queryKey: ["platform", "tenants"],
    queryFn: () => listFn(),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TenantPatch }) =>
      updateFn({ data: { id, patch } }),
    onSuccess: async () => {
      setSeatEditorId(null);
      await queryClient.invalidateQueries({ queryKey: ["platform", "tenants"] });
      toast.success("Tenant updated");
    },
    onError: () => toast.error("Tenant could not be updated"),
  });

  const tenants = tenantsQuery.data?.tenants ?? [];
  const totals = tenantsQuery.data?.totals ?? {
    tenants: 0,
    users: 0,
    requirements: 0,
    candidates: 0,
  };
  const selectedTenant = tenants.find((tenant) => tenant.id === detailTenantId) ?? null;
  const metrics = [
    ["Registered Organizations", totals.tenants, Building2],
    ["Total Users & Team Members", totals.users, UsersRound],
    ["Active Requisitions", totals.requirements, FileText],
    ["Bench Candidates", totals.candidates, UserRoundSearch],
  ] as const;

  return (
    <>
      <AppTopbar title="Platform Console" />
      <main className="flex-1 space-y-5 p-6 md:p-8">
        <PageHeader
          title="Platform Console"
          description="Level 1 — Staffinix SaaS Administration · Multi-tenant accounts, subscription plans & governance."
        />

        <section aria-label="Platform totals" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(([label, value, Icon]) => (
            <Card key={label} className="border-border bg-card shadow-none">
              <CardContent className="flex items-center gap-3 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-semibold leading-tight tabular-nums">
                    {tenantsQuery.isLoading ? "—" : value.toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="overflow-hidden border-border bg-card shadow-none">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">
              Registered Customer Tenants ({totals.tenants})
            </h2>
          </div>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[220px]">Company &amp; Domain</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>EIN No.</TableHead>
                    <TableHead>Contact Email</TableHead>
                    <TableHead className="w-[240px]">Plan &amp; Status</TableHead>
                    <TableHead className="text-center">
                      Seats In Use /<br />
                      Max Users
                    </TableHead>
                    <TableHead className="text-center">
                      Requisitions &amp;
                      <br />
                      Candidates
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenantsQuery.isLoading && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                      </TableCell>
                    </TableRow>
                  )}
                  {tenantsQuery.isError && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        role="alert"
                        className="h-32 text-center text-destructive"
                      >
                        Tenant data could not be loaded.
                      </TableCell>
                    </TableRow>
                  )}
                  {!tenantsQuery.isLoading && !tenantsQuery.isError && tenants.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                        No tenants recorded.
                      </TableCell>
                    </TableRow>
                  )}
                  {tenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <p className="font-semibold">{tenant.name}</p>
                        {getSafeHttpUrl(tenant.website) ? (
                          <a
                            href={getSafeHttpUrl(tenant.website) ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            {domainLabel(tenant.website, tenant.slug)}
                          </a>
                        ) : (
                          <p className="text-xs text-primary">{domainLabel(null, tenant.slug)}</p>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {tenant.industry || "Not recorded"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {tenant.tax_id || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {tenant.primary_contact_email || tenant.admin_contact_email || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={tenant.plan}
                            disabled={updateMutation.isPending}
                            onValueChange={(plan) =>
                              updateMutation.mutate({
                                id: tenant.id,
                                patch: { plan: plan as TenantPatch["plan"] },
                              })
                            }
                          >
                            <SelectTrigger
                              aria-label={`Plan for ${tenant.name}`}
                              className="h-8 w-28 text-xs"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PLANS.map((plan) => (
                                <SelectItem key={plan} value={plan}>
                                  {titleCase(plan)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={tenant.status}
                            disabled={updateMutation.isPending}
                            onValueChange={(status) =>
                              updateMutation.mutate({
                                id: tenant.id,
                                patch: { status: status as TenantPatch["status"] },
                              })
                            }
                          >
                            <SelectTrigger
                              aria-label={`Status for ${tenant.name}`}
                              className="h-8 w-28 text-xs"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {titleCase(status)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-semibold tabular-nums">
                        {seatEditorId === tenant.id ? (
                          <div className="flex items-center justify-center gap-1">
                            <Input
                              aria-label={`Seat limit for ${tenant.name}`}
                              type="number"
                              min={1}
                              max={10000}
                              value={seatDraft}
                              onChange={(event) => setSeatDraft(Number(event.target.value))}
                              className="h-8 w-20 text-center"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={
                                updateMutation.isPending || seatDraft < 1 || seatDraft > 10000
                              }
                              onClick={() =>
                                updateMutation.mutate({
                                  id: tenant.id,
                                  patch: { seat_limit: seatDraft },
                                })
                              }
                            >
                              <Check className="h-4 w-4" />
                              <span className="sr-only">Save seat limit</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setSeatEditorId(null)}
                            >
                              <X className="h-4 w-4" />
                              <span className="sr-only">Cancel seat editing</span>
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            <span>{tenant.stats.users}</span>
                            <span className="text-muted-foreground">/</span>
                            <span>{tenant.seat_limit}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={() => {
                                setSeatDraft(tenant.seat_limit);
                                setSeatEditorId(tenant.id);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span className="sr-only">Edit seat limit</span>
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-xs font-semibold text-primary">
                        <p>{tenant.stats.requirements} Requisitions</p>
                        <p>{tenant.stats.candidates} Candidates</p>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-primary"
                          onClick={() => setDetailTenantId(tenant.id)}
                        >
                          <Eye className="h-3.5 w-3.5" /> Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog
        open={Boolean(selectedTenant)}
        onOpenChange={(open) => !open && setDetailTenantId(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          {selectedTenant && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedTenant.name}</DialogTitle>
                <DialogDescription>Tenant registration and account contacts.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-5 py-2 sm:grid-cols-2">
                <Detail label="Industry" value={selectedTenant.industry} />
                <Detail label="EIN No." value={selectedTenant.tax_id} />
                <Detail label="Website" value={selectedTenant.website} />
                <Detail label="Company email" value={selectedTenant.primary_contact_email} />
                <Detail label="Owner" value={selectedTenant.owner_contact_name} />
                <Detail label="Owner contact" value={selectedTenant.owner_contact_email} />
                <Detail label="Administrator" value={selectedTenant.admin_contact_name} />
                <Detail label="Admin contact" value={selectedTenant.admin_contact_email} />
                <div className="sm:col-span-2">
                  <Detail label="Company address" value={selectedTenant.company_address} />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
