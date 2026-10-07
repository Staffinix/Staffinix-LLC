import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2, ScrollText, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { getRecentActivity } from "@/lib/dashboard.functions";
import { useProfile } from "@/hooks/use-profile";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Audit Logs — Staffinix" }] }),
  component: AuditPage,
});

type AuditLog = Awaited<ReturnType<typeof getRecentActivity>>[number] & {
  details?: string | null;
};

function getAuditMetadata(metadata: AuditLog["metadata"]): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

function formatAuditItem(a: AuditLog) {
  const metadata = getAuditMetadata(a.metadata);
  if (typeof metadata.title === "string" && typeof metadata.description === "string") {
    return {
      title: metadata.title,
      details: metadata.description,
    };
  }
  if (a.details) {
    return {
      title: (a.action || "AUDIT").replace(/[._]/g, " ").toUpperCase(),
      details: a.details,
    };
  }
  const action = a.action || "";
  const entityId = a.entity_id || "";

  return {
    title: action.replace(/[._]/g, " ").toUpperCase() || "AUDIT LOG",
    details:
      (typeof metadata.description === "string" ? metadata.description : null) ||
      (entityId
        ? `Activity recorded for ${a.entity_type || "item"} #${entityId}`
        : "Activity recorded."),
  };
}

function AuditPage() {
  const [isExpanded, setIsExpanded] = useState(false);
  const activityFn = useServerFn(getRecentActivity);

  const {
    data: serverLogs,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["audit-logs-list"],
    queryFn: () => activityFn(),
  });

  const auditLogs = serverLogs ?? [];
  const displayedLogs = isExpanded ? auditLogs : auditLogs.slice(0, 10);

  return (
    <>
      <AppTopbar title="Audit Logs" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <PageHeader
          title="Recruiter Activity & System Audit Logs"
          description="Track recent team activity, client submissions, resume tailoring runs, and authorization events across your organization."
        />

        <Card className="border-border bg-card">
          <CardHeader className="p-4 pb-2 border-b border-border">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-primary" /> Recent Activity Trail (
                {displayedLogs.length} of {auditLogs.length} Events)
              </span>
              {auditLogs.length > 10 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-xs text-muted-foreground hover:text-foreground gap-1.5 h-7"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5 text-primary" /> Show Top 10 Logs
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5 text-primary" /> Expand All{" "}
                      {auditLogs.length} Logs
                    </>
                  )}
                </Button>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Chronological log of recruiter desk and administrative actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center p-12 text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading audit activity…
              </div>
            ) : isError ? (
              <div
                role="alert"
                className="flex items-center justify-center p-12 text-xs text-destructive"
              >
                Audit activity could not be loaded. Please retry in a moment.
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="flex items-center justify-center p-12 text-xs text-muted-foreground">
                No audit activity yet.
              </div>
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {displayedLogs.map((a) => {
                    const formatted = formatAuditItem(a);
                    return (
                      <li
                        key={a.id}
                        className="p-4 hover:bg-muted/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="text-[10px] font-mono border-primary/30 text-primary"
                            >
                              {formatted.title}
                            </Badge>
                            <span className="text-xs font-semibold text-foreground">
                              {a.actor_email || "System"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{formatted.details}</p>
                        </div>

                        <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                          <p className="font-semibold text-foreground">
                            {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                          </p>
                          <p className="font-mono text-[10px]">
                            {format(new Date(a.created_at), "MMM d, yyyy · HH:mm")}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {auditLogs.length > 10 && (
                  <div className="flex justify-center p-3 border-t border-border bg-surface/50">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-4 w-4 text-primary" /> Collapse to 10 Logs
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 text-primary" /> Expand All{" "}
                          {auditLogs.length} Audit Logs
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
