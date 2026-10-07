import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRecruiter } from "@/lib/recruiters.functions";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  recruiter: "Recruiter",
  account_manager: "Account Manager",
  delivery_manager: "Delivery Manager",
  marketing_executive: "Marketing",
};

export const Route = createFileRoute("/_authenticated/recruiters/$id")({
  head: () => ({ meta: [{ title: "Recruiter — Staffinix" }] }),
  component: RecruiterDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{(error as Error).message}</div>
  ),
  notFoundComponent: () => <div className="p-6">Recruiter not found.</div>,
});

function RecruiterDetailPage() {
  const { id } = Route.useParams();
  const fn = useServerFn(getRecruiter);
  const { data, isLoading, error } = useQuery({
    queryKey: ["recruiter", id],
    queryFn: () => fn({ data: { id } }),
  });

  if (isLoading)
    return (
      <div className="p-6">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  if (error) return <div className="p-6 text-destructive">{(error as Error).message}</div>;
  if (!data) return null;
  const p = data.profile;
  const initials = (p.full_name ?? p.email ?? "?")
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen flex-col">
      <AppTopbar title={p.full_name ?? p.email ?? "Recruiter"} />
      <div className="flex-1 space-y-6 p-6">
        <PageHeader
          title={p.full_name ?? "—"}
          description={p.email}
          actions={
            <div className="flex flex-wrap items-center gap-1">
              {(p.roles ?? []).map((r: string) => (
                <Badge
                  key={r}
                  variant="outline"
                  className="border-primary/20 bg-primary/10 text-primary text-xs"
                >
                  {ROLE_LABEL[r] ?? r}
                </Badge>
              ))}
            </div>
          }
        />

        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={p.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary/20 text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="grid grid-cols-4 gap-4 flex-1">
            <Stat label="Requirements" value={data.requirements.length} />
            <Stat label="Submissions" value={data.submissions.length} />
            <Stat label="Interviews" value={data.interviews.length} />
            <Stat label="Placements" value={data.placements.length} />
          </div>
        </div>

        <Tabs defaultValue="requirements">
          <TabsList>
            <TabsTrigger value="requirements">Requirements</TabsTrigger>
            <TabsTrigger value="submissions">Submissions</TabsTrigger>
            <TabsTrigger value="interviews">Interviews</TabsTrigger>
            <TabsTrigger value="placements">Placements</TabsTrigger>
          </TabsList>

          <TabsContent value="requirements" className="mt-4">
            <List
              rows={data.requirements}
              empty="No requirements assigned."
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
                  <div className="mt-1 text-xs text-muted-foreground">
                    {r.status} · {r.priority}
                  </div>
                </Link>
              )}
            />
          </TabsContent>
          <TabsContent value="submissions" className="mt-4">
            <List
              rows={data.submissions}
              empty="No submissions."
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
          <TabsContent value="interviews" className="mt-4">
            <List
              rows={data.interviews}
              empty="No interviews."
              render={(i) => (
                <div className="rounded-md border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Round {i.round}</span>
                    <span className="text-xs text-muted-foreground">
                      {i.scheduled_at ? new Date(i.scheduled_at).toLocaleString() : "—"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Outcome: {i.outcome ?? "pending"}
                  </div>
                </div>
              )}
            />
          </TabsContent>
          <TabsContent value="placements" className="mt-4">
            <List
              rows={data.placements}
              empty="No placements."
              render={(pl) => (
                <div className="rounded-md border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Placement {pl.id.slice(0, 8)}</span>
                    <span className="text-xs text-muted-foreground">{pl.status}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {pl.start_date} → {pl.end_date ?? "ongoing"}
                  </div>
                </div>
              )}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
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
