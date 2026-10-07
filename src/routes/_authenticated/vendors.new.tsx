import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { CrmForm, type CrmFormValues } from "@/components/crm/crm-form";
import { createVendor } from "@/lib/vendors.functions";

export const Route = createFileRoute("/_authenticated/vendors/new")({
  head: () => ({
    meta: [
      { title: "New vendor — Staffinix" },
      { name: "description", content: "Add a vendor partner to Staffinix." },
    ],
  }),
  component: NewVendorPage,
});

function NewVendorPage() {
  const createFn = useServerFn(createVendor);
  const navigate = useNavigate();
  const m = useMutation({
    mutationFn: (v: CrmFormValues) => createFn({ data: v as never }),
    onSuccess: (row) => {
      toast.success("Vendor created");
      navigate({ to: "/vendors/$id", params: { id: row.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create"),
  });

  return (
    <div className="flex min-h-screen flex-col">
      <AppTopbar title="New vendor" />
      <div className="flex-1 space-y-6 p-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/vendors" })}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Vendors
          </Button>
        </div>
        <PageHeader title="New vendor" description="Add a sourcing partner or vendor." />
        <div className="w-full">
          <CrmForm
            kind="vendor"
            submitting={m.isPending}
            submitLabel="Create vendor"
            onSubmit={(v) => m.mutate(v)}
            onCancel={() => navigate({ to: "/vendors" })}
          />
        </div>
      </div>
    </div>
  );
}
