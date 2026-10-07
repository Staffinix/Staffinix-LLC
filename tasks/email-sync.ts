import { defineTask } from "nitro/task";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { synchronizeEmailAccount } from "@/lib/email/sync-service.server";

const MAX_ACCOUNTS_PER_RUN = 25;

export default defineTask({
  meta: {
    name: "email-sync",
    description: "Synchronize connected L4 recruiter email accounts",
  },
  async run() {
    const { data: accounts, error } = await supabaseAdmin
      .from("email_accounts")
      .select("id, user_id, tenant_id")
      .eq("status", "connected")
      .order("last_sync_at", { ascending: true, nullsFirst: true })
      .limit(MAX_ACCOUNTS_PER_RUN);
    if (error) throw new Error("Unable to claim email accounts for scheduled synchronization");

    let completed = 0;
    let failed = 0;
    for (const account of accounts ?? []) {
      try {
        await synchronizeEmailAccount({
          supabase: supabaseAdmin,
          userId: account.user_id,
          tenantId: account.tenant_id,
          accountId: account.id,
          mode: "worker",
        });
        completed += 1;
      } catch {
        // The sync service records a safe error code on the account and job.
        failed += 1;
      }
    }
    return { result: { inspected: accounts?.length ?? 0, completed, failed } };
  },
});
