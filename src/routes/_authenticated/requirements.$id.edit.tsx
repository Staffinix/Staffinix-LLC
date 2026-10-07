import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getRequirement, listLookups } from "@/lib/requirements.functions";
import {
  RequirementForm,
  type RequirementFormValues,
} from "@/components/requirements/requirement-form";
import type {
  RequirementStatus,
  RequirementPriority,
  WorkMode,
  RateType,
} from "@/lib/requirements-constants";

export const Route = createFileRoute("/_authenticated/requirements/$id/edit")({
  head: () => ({ meta: [{ title: "Edit requirement — Staffinix" }] }),
  component: EditRequirementPage,
});

function EditRequirementPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const getFn = useServerFn(getRequirement);
  const lookupsFn = useServerFn(listLookups);

  const { data, isLoading, error } = useQuery({
    queryKey: ["requirement", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const { data: lookups } = useQuery({
    queryKey: ["req-lookups"],
    queryFn: () => lookupsFn(),
  });

  if (isLoading) {
    return (
      <>
        <AppTopbar title="Edit requirement" />
        <main className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </main>
      </>
    );
  }
  if (error || !data) {
    return (
      <>
        <AppTopbar title="Edit requirement" />
        <main className="p-8 text-sm text-destructive">
          {(error as Error)?.message ?? "Not found"}
        </main>
      </>
    );
  }

  const initialValues: Partial<RequirementFormValues> = {
    title: data.title,
    client_id: data.client_id,
    vendor_id: data.vendor_id,
    location: data.location ?? "",
    work_mode: (data.work_mode as WorkMode | null) ?? undefined,
    visa_types: data.visa_types ?? [],
    rate_min: data.rate_min ? Number(data.rate_min) : null,
    rate_max: data.rate_max ? Number(data.rate_max) : null,
    rate_type: (data.rate_type as RateType | null) ?? undefined,
    currency: data.currency ?? "USD",
    min_experience_years: data.min_experience_years,
    max_experience_years: data.max_experience_years,
    primary_technology: data.primary_technology ?? "",
    description: data.description ?? "",
    recruiter_notes: data.recruiter_notes ?? "",
    status: data.status as RequirementStatus,
    duration: data.duration ?? "",
    skills: data.skills.map((s) => ({ skill: s.skill, is_mandatory: s.is_mandatory })),
  };

  return (
    <>
      <AppTopbar title="Edit requirement" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/requirements/$id" params={{ id }}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to requirement
            </Link>
          </Button>
        </div>
        <PageHeader title="Edit requirement" description={data.title} />

        <RequirementForm
          mode="edit"
          requirementId={id}
          initialValues={initialValues}
          lookups={lookups}
          onSaved={(rid) => navigate({ to: "/requirements/$id", params: { id: rid } })}
          onCancel={() => navigate({ to: "/requirements/$id", params: { id } })}
        />
      </main>
    </>
  );
}
