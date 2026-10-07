import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listRecruiters } from "@/lib/recruiters.functions";
import { Loader2, Search } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  recruiter: "Recruiter",
  account_manager: "Account Manager",
  delivery_manager: "Delivery Manager",
  marketing_executive: "Marketing",
};

export const Route = createFileRoute("/_authenticated/recruiters/")({
  head: () => ({
    meta: [
      { title: "Recruiters — Staffinix" },
      {
        name: "description",
        content: "Internal team performance: assignments, submissions, interviews, placements.",
      },
    ],
  }),
  component: RecruitersPage,
});

function RecruitersPage() {
  const listFn = useServerFn(listRecruiters);
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["recruiters"],
    queryFn: () => listFn(),
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s || !data) return data ?? [];
    return data.filter(
      (r) =>
        (r.full_name ?? "").toLowerCase().includes(s) || (r.email ?? "").toLowerCase().includes(s),
    );
  }, [data, search]);

  return (
    <div className="flex min-h-screen flex-col">
      <AppTopbar title="Recruiters" />
      <div className="flex-1 space-y-6 p-6">
        <PageHeader title="Recruiters" description="Team performance and workload." />

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="pl-8"
          />
        </div>

        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="text-right">Open reqs</TableHead>
                <TableHead className="text-right">Submissions</TableHead>
                <TableHead className="text-right">Interviews</TableHead>
                <TableHead className="text-right">Placements</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-destructive">
                    {(error as Error).message}
                  </TableCell>
                </TableRow>
              ) : !filtered.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No team members found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => {
                  const initials = (r.full_name ?? r.email ?? "?")
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase();
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link
                          to="/recruiters/$id"
                          params={{ id: r.id }}
                          className="flex items-center gap-3 hover:underline"
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={r.avatar_url ?? undefined} />
                            <AvatarFallback className="bg-primary/20 text-xs text-primary">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="text-sm font-medium">{r.full_name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{r.email}</div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.roles.map((role) => (
                            <Badge
                              key={role}
                              variant="outline"
                              className="border-primary/20 bg-primary/10 text-primary text-xs"
                            >
                              {ROLE_LABEL[role] ?? role}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {r.open_requirements}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {r.submissions}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{r.interviews}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{r.placements}</TableCell>
                      <TableCell>
                        {r.is_active ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                          >
                            Active
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-border bg-muted text-muted-foreground"
                          >
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
