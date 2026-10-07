// Server-only audit log helper. Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AuditEntry = {
  actorId: string;
  actorEmail?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const { data: actor } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("id", entry.actorId)
      .maybeSingle();

    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: actor?.tenant_id ?? null,
      actor_id: entry.actorId,

      actor_email: entry.actorEmail ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      metadata: (entry.metadata ?? {}) as never,
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
    });
  } catch {
    // Never let audit failure break the primary operation.
    // Do not log the Supabase error object: transport errors may contain
    // request headers or other privileged client details.
    console.error("[audit] write failed");
  }
}
