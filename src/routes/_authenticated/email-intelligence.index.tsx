import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Filter,
  Inbox,
  MailCheck,
  MailX,
  Paperclip,
  Settings2,
} from "lucide-react";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getEmailDashboard } from "@/lib/email-intelligence.functions";

export const Route = createFileRoute("/_authenticated/email-intelligence/")({
  head: () => ({ meta: [{ title: "Smart Email — Staffinix" }] }),
  component: SmartEmailDashboard,
});

function SmartEmailDashboard() {
  const dashboardFn = useServerFn(getEmailDashboard);
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState<"all" | "gmail" | "microsoft">("all");
  const [minimumScore, setMinimumScore] = useState("0");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<
    Awaited<ReturnType<typeof dashboardFn>>["rows"][number] | null
  >(null);
  const filters = useMemo(
    () => ({
      search: search || undefined,
      provider,
      minimum_score: Number(minimumScore),
      page,
      page_size: 20,
    }),
    [minimumScore, page, provider, search],
  );
  const query = useQuery({
    queryKey: ["smart-email", filters],
    queryFn: () => dashboardFn({ data: filters }),
    retry: false,
  });
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 20));
  const stats = query.data?.stats;

  return (
    <>
      <AppTopbar title="Smart Email" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <PageHeader
          title="Smart Email Intelligence"
          description="Read-only Gmail and Outlook filtering for recruitment messages. Staffinix never moves, deletes, archives, or marks provider mail as read."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/email-intelligence/rules">
                  <Filter className="mr-1.5 size-4" />
                  Rules
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/settings/email-accounts">
                  <Settings2 className="mr-1.5 size-4" />
                  Accounts
                </Link>
              </Button>
            </div>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            { label: "Connected", value: stats?.connectedAccounts ?? 0, Icon: Inbox },
            { label: "Processed (30d)", value: stats?.processed ?? 0, Icon: Clock3 },
            { label: "Relevant", value: stats?.relevant ?? 0, Icon: MailCheck },
            { label: "Ignored", value: stats?.ignored ?? 0, Icon: MailX },
            { label: "Active rules", value: stats?.activeRules ?? 0, Icon: Filter },
            {
              label: "Last sync",
              value: stats?.lastSync ? new Date(stats.lastSync).toLocaleDateString() : "Never",
              Icon: CheckCircle2,
            },
          ].map(({ label, value, Icon }) => (
            <Card key={String(label)}>
              <CardContent className="flex items-center gap-3 p-4">
                <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-semibold">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
              <SearchInput
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search sender or subject…"
              />
              <Select
                value={provider}
                onValueChange={(value) => {
                  setProvider(value as typeof provider);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  <SelectItem value="gmail">Gmail</SelectItem>
                  <SelectItem value="microsoft">Outlook</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={minimumScore}
                onValueChange={(value) => {
                  setMinimumScore(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Any relevance</SelectItem>
                  <SelectItem value="0.7">70% or higher</SelectItem>
                  <SelectItem value="0.85">85% or higher</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sender</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>AI category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(query.data?.rows ?? []).map((email) => {
                    const rule = query.data?.rules.find(
                      (item) => item.id === email.matched_rule_id,
                    );
                    return (
                      <TableRow
                        key={email.id}
                        className="cursor-pointer"
                        onClick={() => setSelected(email)}
                      >
                        <TableCell>
                          <p className="font-medium">{email.sender_name || email.sender_email}</p>
                          <p className="text-xs text-muted-foreground">{email.sender_email}</p>
                        </TableCell>
                        <TableCell className="max-w-sm">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{email.subject || "(No subject)"}</span>
                            {email.has_attachments && (
                              <Paperclip className="size-3.5 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{new Date(email.received_at).toLocaleString()}</TableCell>
                        <TableCell>{rule?.name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {Math.round(email.relevance_score * 100)}%
                          </Badge>
                        </TableCell>
                        <TableCell>{email.ai_category ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {query.isPending && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        Loading selected emails…
                      </TableCell>
                    </TableRow>
                  )}
                  {query.isError && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-destructive">
                        Smart Email data could not be loaded.
                      </TableCell>
                    </TableRow>
                  )}
                  {!query.isPending && !query.isError && (query.data?.rows.length ?? 0) === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        No selected emails match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{query.data?.total ?? 0} selected emails</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </Button>
                <span className="self-center">
                  {page} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.subject || "(No subject)"}</SheetTitle>
                <SheetDescription>
                  {selected.sender_name || selected.sender_email} ·{" "}
                  {new Date(selected.received_at).toLocaleString()}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-5">
                <div className="rounded-xl border bg-muted/30 p-4">
                  <p className="text-sm leading-6 text-muted-foreground">
                    {selected.preview || "No text preview was stored."}
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold">Why this email matched</h3>
                  <ul className="mt-3 space-y-2">
                    {selected.match_reasons.map((reason) => (
                      <li key={reason} className="flex gap-2 text-sm">
                        <CheckCircle2 className="mt-0.5 size-4 text-emerald-500" />
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center justify-between rounded-xl border p-4">
                  <span className="text-sm font-medium">Relevance</span>
                  <span className="text-xl font-bold text-primary">
                    {Math.round(selected.relevance_score * 100)}%
                  </span>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
