import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";

import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRequirement } from "@/lib/requirements.functions";

export const Route = createFileRoute("/_authenticated/requirements/$id")({
  head: () => ({ meta: [{ title: "Requisition — Staffinix" }] }),
  component: RequirementDetailPage,
});

function RequirementDetailPage() {
  const { id } = Route.useParams();
  const getRequirementFn = useServerFn(getRequirement);
  const requirementQuery = useQuery({
    queryKey: ["requirement", id],
    queryFn: () => getRequirementFn({ data: { id } }),
  });

  if (requirementQuery.isLoading)
    return <RequirementState loading message="Loading requisition…" />;
  if (requirementQuery.isError || !requirementQuery.data) {
    return <RequirementState error message="Requisition data could not be loaded." />;
  }

  const requirement = requirementQuery.data;

  return (
    <>
      <AppTopbar title={requirement.title} />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
            <Link to="/requirements">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Requisitions
            </Link>
          </Button>
          <Button asChild size="sm" className="gap-1.5 text-xs">
            <Link to="/matching" search={{ reqId: requirement.id }}>
              <Sparkles className="h-3.5 w-3.5" /> Run matching
            </Link>
          </Button>
        </div>

        <PageHeader
          title={requirement.title}
          description={
            [requirement.client_name, requirement.vendor_name, requirement.location]
              .filter(Boolean)
              .join(" · ") || "Requisition details"
          }
        />

        <Card className="border-border bg-card">
          <CardContent className="grid gap-4 p-6 md:grid-cols-4">
            <Detail label="Status" value={requirement.status} />
            <Detail label="Priority" value={requirement.priority} />
            <Detail label="Work mode" value={requirement.work_mode} />
            <Detail label="Duration" value={requirement.duration} />
            <Detail
              label="Minimum experience"
              value={formatYears(requirement.min_experience_years)}
            />
            <Detail
              label="Maximum experience"
              value={formatYears(requirement.max_experience_years)}
            />
            <Detail
              label="Minimum rate"
              value={formatRate(requirement.rate_min, requirement.currency, requirement.rate_type)}
            />
            <Detail
              label="Maximum rate"
              value={formatRate(requirement.rate_max, requirement.currency, requirement.rate_type)}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm">Job description</CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
              {requirement.description || "No job description recorded."}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm">Required skills</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {requirement.skills.map((skill) => (
                <Badge key={skill.id} variant={skill.is_mandatory ? "default" : "outline"}>
                  {skill.skill}
                </Badge>
              ))}
              {requirement.skills.length === 0 && (
                <p className="text-sm text-muted-foreground">No required skills recorded.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

function RequirementState({
  message,
  loading = false,
  error = false,
}: {
  message: string;
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <>
      <AppTopbar title="Requisition" />
      <main className="flex-1 p-6 md:p-8">
        <Card role={error ? "alert" : "status"} className="border-border bg-card">
          <CardContent
            className={
              error
                ? "p-10 text-center text-sm text-destructive"
                : "p-10 text-center text-sm text-muted-foreground"
            }
          >
            {loading && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}
            {message}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold capitalize">{value ?? "Not recorded"}</p>
    </div>
  );
}

function formatYears(value: number | null) {
  return value == null ? null : `${value} years`;
}

function formatRate(value: number | null, currency: string, rateType: string | null) {
  return value == null ? null : `${currency} ${value}${rateType ? ` / ${rateType}` : ""}`;
}
