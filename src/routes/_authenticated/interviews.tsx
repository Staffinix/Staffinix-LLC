import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarClock, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { listInterviews } from "@/lib/interviews.functions";
import {
  INTERVIEW_OUTCOMES,
  ROUND_LABEL,
  OUTCOME_LABEL,
  OUTCOME_STYLE,
  type InterviewRound,
  type InterviewOutcome,
} from "@/lib/submissions-constants";

export const Route = createFileRoute("/_authenticated/interviews")({
  head: () => ({ meta: [{ title: "Interviews — Staffinix" }] }),
  component: InterviewsPage,
});

function InterviewsPage() {
  const listFn = useServerFn(listInterviews);
  const [outcome, setOutcome] = useState<string>("all");
  const [upcoming, setUpcoming] = useState<boolean>(true);

  const { data, isLoading } = useQuery({
    queryKey: ["interviews", { outcome, upcoming }],
    queryFn: () =>
      listFn({
        data: {
          outcome: outcome === "all" ? undefined : [outcome as InterviewOutcome],
          upcoming_only: upcoming,
          page: 1,
          page_size: 100,
        },
      }),
  });

  const rows = data?.rows ?? [];

  return (
    <>
      <AppTopbar title="Interviews" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <PageHeader
          title="Interview center"
          description="Every scheduled, in-progress, and completed interview."
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={upcoming ? "default" : "outline"}
            size="sm"
            onClick={() => setUpcoming(true)}
          >
            Upcoming
          </Button>
          <Button
            variant={!upcoming ? "default" : "outline"}
            size="sm"
            onClick={() => setUpcoming(false)}
          >
            All
          </Button>
          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Outcome" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              {INTERVIEW_OUTCOMES.map((o) => (
                <SelectItem key={o} value={o}>
                  {OUTCOME_LABEL[o]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead>Requirement</TableHead>
                <TableHead>Round</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Interviewer</TableHead>
                <TableHead />
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
                    <CalendarClock className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
                    No interviews here.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-sm">
                      {i.scheduled_at
                        ? format(new Date(i.scheduled_at), "EEE, MMM d · h:mm a")
                        : "—"}
                      <p className="text-xs text-muted-foreground">
                        {i.duration_minutes ?? 45} min · {i.timezone}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {i.submission?.candidate?.first_name} {i.submission?.candidate?.last_name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {i.submission?.requirement?.title ?? "—"}
                    </TableCell>
                    <TableCell>
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">
                        {ROUND_LABEL[i.round as InterviewRound]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={OUTCOME_STYLE[i.outcome as InterviewOutcome]}
                      >
                        {OUTCOME_LABEL[i.outcome as InterviewOutcome]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {i.interviewer_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to="/submissions/$id" params={{ id: i.submission_id }}>
                          Open
                        </Link>
                      </Button>
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
