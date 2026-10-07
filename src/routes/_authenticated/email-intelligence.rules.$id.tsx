import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmailRuleForm } from "@/components/email/email-rule-form";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { listEmailRules } from "@/lib/email-intelligence.functions";

export const Route = createFileRoute("/_authenticated/email-intelligence/rules/$id")({
  component: EditEmailRulePage,
});
function EditEmailRulePage() {
  const { id } = Route.useParams();
  const listFn = useServerFn(listEmailRules);
  const query = useQuery({ queryKey: ["email-rules"], queryFn: () => listFn() });
  const rule = query.data?.find((item) => item.id === id);
  if (query.isPending) return <LoadingOverlay label="Loading rule…" />;
  return (
    <>
      <AppTopbar title="Edit Smart Email Rule" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <PageHeader
          title={rule ? `Edit ${rule.name}` : "Rule not found"}
          description="Changes apply to future email synchronization runs."
        />
        {rule ? (
          <EmailRuleForm initial={{ ...rule, match_mode: rule.match_mode as "and" | "or" }} />
        ) : (
          <p className="text-sm text-muted-foreground">
            This rule is unavailable or has been deleted.
          </p>
        )}
      </main>
    </>
  );
}
