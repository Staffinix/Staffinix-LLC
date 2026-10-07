import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CrmForm } from "@/components/crm/crm-form";
import { deleteVendor, getVendor, updateVendor } from "@/lib/vendors.functions";
import { STATUS_LABEL, STATUS_STYLES, TIER_LABEL, TIER_STYLES } from "@/lib/crm-constants";
import { Loader2, Trash2, Mail, Phone, Globe, MapPin, Linkedin, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/vendors/$id")({
  head: () => ({ meta: [{ title: "Vendor — Staffinix" }] }),
  component: VendorDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{(error as Error).message}</div>
  ),
  notFoundComponent: () => <div className="p-6">Vendor not found.</div>,
});

function VendorDetailPage() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getVendor);
  const updateFn = useServerFn(updateVendor);
  const deleteFn = useServerFn(deleteVendor);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");

  const { data, isLoading, error } = useQuery({
    queryKey: ["vendor", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const upd = useMutation({
    mutationFn: (patch: Record<string, unknown>) => updateFn({ data: { id, patch } as never }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["vendor", id] });
      qc.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const del = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      navigate({ to: "/vendors" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (isLoading)
    return (
      <div className="p-6">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  if (error) return <div className="p-6 text-destructive">{(error as Error).message}</div>;
  if (!data) return null;
  const v = data.vendor;

  return (
    <div className="flex min-h-screen flex-col">
      <AppTopbar title={v.name} />
      <div className="flex-1 space-y-6 p-6">
        <PageHeader
          title={v.name}
          description="Vendor partner"
          actions={
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn("border", STATUS_STYLES[v.status])}>
                {STATUS_LABEL[v.status]}
              </Badge>
              {v.tier && (
                <Badge variant="outline" className={cn("border", TIER_STYLES[v.tier])}>
                  {TIER_LABEL[v.tier]}
                </Badge>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete vendor?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Related records will keep their history but lose the vendor link.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => del.mutate()}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          }
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="requirements">
              Requirements ({data.requirements.length})
            </TabsTrigger>
            <TabsTrigger value="submissions">Submissions ({data.submissions.length})</TabsTrigger>
            <TabsTrigger value="edit">Edit</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Contact">
                <Row
                  icon={<Mail className="h-4 w-4" />}
                  label="Contact"
                  value={v.contact_name ?? "—"}
                />
                <Row
                  icon={<Mail className="h-4 w-4" />}
                  label="Email"
                  value={v.contact_email ?? "—"}
                />
                <Row
                  icon={<Phone className="h-4 w-4" />}
                  label="Phone"
                  value={v.contact_phone ?? "—"}
                />
                <Row
                  icon={<Briefcase className="h-4 w-4" />}
                  label="Role"
                  value={v.contact_role ?? "—"}
                />
                <Row
                  icon={<Linkedin className="h-4 w-4" />}
                  label="LinkedIn"
                  value={v.linkedin_id ?? "—"}
                />
                <Row
                  icon={<Globe className="h-4 w-4" />}
                  label="Website"
                  value={v.website ?? "—"}
                />
              </Card>
              <Card title="Location">
                <Row
                  icon={<MapPin className="h-4 w-4" />}
                  label="Address"
                  value={v.address ?? "—"}
                />
                <Row
                  label="City / State"
                  value={[v.city, v.state].filter(Boolean).join(", ") || "—"}
                />
                <Row label="Country" value={v.country ?? "—"} />
                <Row label="Postal" value={v.postal_code ?? "—"} />
              </Card>
              <Card title="Terms">
                <Row
                  label="Payment terms"
                  value={v.payment_terms_days != null ? `Net ${v.payment_terms_days} days` : "—"}
                />
                <Row label="Tax ID" value={v.tax_id ?? "—"} />
                <Row label="MSA signed" value={v.msa_signed_at ?? "—"} />
              </Card>
              {v.notes && (
                <Card title="Notes">
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{v.notes}</p>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="requirements" className="mt-6">
            <List
              rows={data.requirements}
              empty="No requirements from this vendor."
              render={(r) => (
                <Link
                  to="/requirements/$id"
                  params={{ id: r.id }}
                  className="block rounded-md border border-border bg-card p-3 hover:bg-accent"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{r.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{r.status}</div>
                </Link>
              )}
            />
          </TabsContent>

          <TabsContent value="submissions" className="mt-6">
            <List
              rows={data.submissions}
              empty="No submissions yet."
              render={(s) => (
                <Link
                  to="/submissions/$id"
                  params={{ id: s.id }}
                  className="block rounded-md border border-border bg-card p-3 hover:bg-accent"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Submission {s.id.slice(0, 8)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Stage: {s.stage}</div>
                </Link>
              )}
            />
          </TabsContent>

          <TabsContent value="edit" className="mt-6">
            <div className="max-w-3xl">
              <CrmForm
                kind="vendor"
                initial={v as never}
                submitting={upd.isPending}
                submitLabel="Save changes"
                onSubmit={(val) => upd.mutate(val)}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h4 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Row({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
function List<T>({
  rows,
  empty,
  render,
}: {
  rows: T[];
  empty: string;
  render: (r: T) => React.ReactNode;
}) {
  if (!rows.length)
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {empty}
      </div>
    );
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i}>{render(r)}</div>
      ))}
    </div>
  );
}
