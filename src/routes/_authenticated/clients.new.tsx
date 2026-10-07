import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { CrmForm, type CrmFormValues } from "@/components/crm/crm-form";
import { createClient } from "@/lib/clients.functions";

export const Route = createFileRoute("/_authenticated/clients/new")({
  head: () => ({
    meta: [
      { title: "New client — Staffinix" },
      { name: "description", content: "Add a client account to Staffinix." },
    ],
  }),
  component: NewClientPage,
});

function NewClientPage() {
  const createFn = useServerFn(createClient);
  const navigate = useNavigate();
  const m = useMutation({
    mutationFn: (v: CrmFormValues) => createFn({ data: v as never }),
    onSuccess: (row) => {
      toast.success("Client created");
      navigate({ to: "/clients/$id", params: { id: row.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create"),
  });

  return (
    <div className="flex min-h-screen flex-col">
      <AppTopbar title="New client" />
      <div className="flex-1 space-y-6 p-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/clients" })}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Clients
          </Button>
        </div>
        <PageHeader title="New client" description="Add a company to your CRM." />
        <div className="w-full">
          <CrmForm
            kind="client"
            submitting={m.isPending}
            submitLabel="Create client"
            onSubmit={(v) => m.mutate(v)}
            onCancel={() => navigate({ to: "/clients" })}
          />
        </div>
      </div>
    </div>
  );
}
