import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  changeSubmissionStage,
  deleteSubmission,
  listSubmissions,
} from "@/lib/submissions.functions";

const STAGES = [
  "draft",
  "submitted",
  "vendor_review",
  "client_review",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;
type Stage = (typeof STAGES)[number];
const PAGE_SIZE = 50;

export const Route = createFileRoute("/_authenticated/submissions/board")({
  head: () => ({ meta: [{ title: "Pipeline Tracker — Staffinix" }] }),
  component: PipelineTrackerPage,
});

function PipelineTrackerPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const listFn = useServerFn(listSubmissions);
  const changeStageFn = useServerFn(changeSubmissionStage);
  const deleteFn = useServerFn(deleteSubmission);
  const submissionsQuery = useQuery({
    queryKey: ["submissions", "pipeline", page],
    queryFn: () => listFn({ data: { page, page_size: PAGE_SIZE } }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["submissions", "pipeline"] });
  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: Stage }) =>
      changeStageFn({ data: { id, to_stage: stage } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Submission stage updated");
    },
    onError: () => toast.error("Submission stage could not be updated"),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Submission deleted");
    },
    onError: () => toast.error("Submission could not be deleted"),
  });

  const rows = submissionsQuery.data?.rows ?? [];
  const total = submissionsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <AppTopbar title="Pipeline Tracker" />
      <main className="flex-1 space-y-5 p-6 md:p-8">
        <PageHeader
          title="Pipeline Tracker"
          description="Live submission records for the authenticated tenant."
        />

        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Requisition</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Submitted by</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissionsQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                    </TableCell>
                  </TableRow>
                )}
                {submissionsQuery.isError && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      role="alert"
                      className="h-32 text-center text-destructive"
                    >
                      Submission data could not be loaded.
                    </TableCell>
                  </TableRow>
                )}
                {!submissionsQuery.isLoading && !submissionsQuery.isError && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      No submissions recorded.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {[row.candidate?.first_name, row.candidate?.last_name]
                        .filter(Boolean)
                        .join(" ") || "Not recorded"}
                    </TableCell>
                    <TableCell>{row.requirement?.title || "Not recorded"}</TableCell>
                    <TableCell>{row.client?.name || "Not recorded"}</TableCell>
                    <TableCell>{row.vendor?.name || "Not recorded"}</TableCell>
                    <TableCell>
                      {row.submitted_rate == null
                        ? "Not recorded"
                        : `${row.currency || ""} ${row.submitted_rate}${row.rate_type ? ` / ${row.rate_type}` : ""}`.trim()}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.stage}
                        disabled={stageMutation.isPending}
                        onValueChange={(stage) =>
                          stageMutation.mutate({ id: row.id, stage: stage as Stage })
                        }
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAGES.map((stage) => (
                            <SelectItem key={stage} value={stage}>
                              {stage.replaceAll("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {row.submitter?.full_name ||
                        row.submitter?.email ||
                        row.creator?.full_name ||
                        row.creator?.email ||
                        "Not recorded"}
                    </TableCell>
                    <TableCell>
                      {row.updated_at ? new Date(row.updated_at).toLocaleString() : "Not recorded"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete submission"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(row.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} submissions</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || submissionsQuery.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <span>
              Page {page} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount || submissionsQuery.isFetching}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}
