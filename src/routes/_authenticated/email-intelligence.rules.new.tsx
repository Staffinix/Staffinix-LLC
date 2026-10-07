import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmailRuleForm } from "@/components/email/email-rule-form";

export const Route = createFileRoute("/_authenticated/email-intelligence/rules/new")({
  component: NewEmailRulePage,
});
function NewEmailRulePage() {
  return (
    <>
      <AppTopbar title="New Smart Email Rule" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <PageHeader
          title="Create Filter Rule"
          description="Configure when incoming recruitment mail should be selected."
        />
        <EmailRuleForm />
      </main>
    </>
  );
}
