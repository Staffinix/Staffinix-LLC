import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle, Mail, RefreshCw, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  beginEmailOAuth,
  disconnectEmailAccount,
  getEmailProviderAvailability,
  listEmailAccounts,
  syncEmailAccount,
} from "@/lib/email-intelligence.functions";
import { getProviderUnavailableMessage } from "@/lib/email/connection-health";
import type { EmailProvider } from "@/lib/email/types";

export const Route = createFileRoute("/_authenticated/settings/email-accounts")({
  head: () => ({ meta: [{ title: "Email Accounts — Staffinix" }] }),
  component: EmailAccountsPage,
});

function EmailAccountsPage() {
  const listFn = useServerFn(listEmailAccounts);
  const beginFn = useServerFn(beginEmailOAuth);
  const availabilityFn = useServerFn(getEmailProviderAvailability);
  const syncFn = useServerFn(syncEmailAccount);
  const disconnectFn = useServerFn(disconnectEmailAccount);
  const client = useQueryClient();
  const accounts = useQuery({
    queryKey: ["email-accounts"],
    queryFn: () => listFn(),
    retry: false,
  });
  const availability = useQuery({
    queryKey: ["email-provider-availability"],
    queryFn: () => availabilityFn(),
    retry: false,
  });
  const connect = useMutation({
    mutationFn: (provider: EmailProvider) => beginFn({ data: { provider } }),
    onSuccess: ({ authorizationUrl }) => window.location.assign(authorizationUrl),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Unable to connect account"),
  });
  const sync = useMutation({
    mutationFn: (id: string) => syncFn({ data: { id } }),
    onSuccess: (result) => {
      toast.success(`Processed ${result.processed} messages; selected ${result.selected}.`);
      void client.invalidateQueries({ queryKey: ["email-accounts"] });
      void client.invalidateQueries({ queryKey: ["smart-email"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Sync failed"),
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => disconnectFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Email account disconnected and local credentials removed.");
      void client.invalidateQueries({ queryKey: ["email-accounts"] });
    },
    onError: () => toast.error("Unable to disconnect account"),
  });

  return (
    <>
      <AppTopbar title="Email Accounts" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <PageHeader
          title="Connected Email Accounts"
          description="Connect read-only Gmail or Outlook access. Staffinix stores encrypted OAuth credentials server-side and never changes provider mail."
        />
        {accounts.isPending && (
          <div className="flex items-center gap-2 rounded-xl border p-4 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading connected accounts…
          </div>
        )}
        {accounts.isError && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <TriangleAlert className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              {accounts.error instanceof Error
                ? accounts.error.message
                : "Connected email accounts are temporarily unavailable."}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={accounts.isFetching}
              onClick={() => void accounts.refetch()}
            >
              <RefreshCw
                className={accounts.isFetching ? "mr-1.5 size-3.5 animate-spin" : "mr-1.5 size-3.5"}
              />
              Retry
            </Button>
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {(["gmail", "microsoft"] as const).map((provider) => {
            const providerAvailability = availability.data?.[provider];
            const providerMessage = providerAvailability
              ? getProviderUnavailableMessage(provider, providerAvailability.reason)
              : availability.isError
                ? "Provider configuration could not be checked."
                : null;
            const providerAccounts = (accounts.data ?? []).filter(
              (account) => account.provider === provider,
            );
            return (
              <Card key={provider}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 capitalize">
                    <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Mail className="size-4" />
                    </span>
                    {provider === "gmail" ? "Gmail" : "Microsoft Outlook"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {providerAccounts.map((account) => (
                    <div key={account.id} className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{account.email_address}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Last sync:{" "}
                            {account.last_sync_at
                              ? new Date(account.last_sync_at).toLocaleString()
                              : "Never"}
                          </p>
                        </div>
                        <Badge variant={account.status === "connected" ? "default" : "destructive"}>
                          {account.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={sync.isPending}
                          onClick={() => sync.mutate(account.id)}
                        >
                          <RefreshCw className="mr-1.5 size-3.5" />
                          Sync now
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={disconnect.isPending}
                          onClick={() => disconnect.mutate(account.id)}
                        >
                          <Trash2 className="mr-1.5 size-3.5" />
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!accounts.isPending && !accounts.isError && providerAccounts.length === 0 && (
                    <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                      No {provider === "gmail" ? "Gmail" : "Outlook"} account is connected.
                    </p>
                  )}
                  {providerMessage && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                      {providerMessage}
                    </div>
                  )}
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={
                      availability.isPending ||
                      availability.isError ||
                      providerAvailability?.configured !== true ||
                      connect.isPending
                    }
                    onClick={() => connect.mutate(provider)}
                  >
                    Connect {provider === "gmail" ? "Gmail" : "Outlook"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <p>
            <strong>Read-only by design.</strong> Only message metadata and the text needed for
            enabled rules are evaluated. Attachment binaries are never downloaded; selected messages
            store a short text preview and match reasons.
          </p>
        </div>
      </main>
    </>
  );
}
