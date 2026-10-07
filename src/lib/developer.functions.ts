import { createServerFn } from "@tanstack/react-start";
import { requireDeveloperAccess } from "@/integrations/supabase/auth-middleware";
import type { SupabaseAuthContext } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const WorkflowSchema = z
  .object({
    auto_parse_resumes: z.boolean().optional(),
    auto_match_on_requirement: z.boolean().optional(),
    auto_draft_submission_email: z.boolean().optional(),
    interview_reminders: z.boolean().optional(),
    match_score_threshold: z.number().int().min(0).max(100).optional(),
    webhook_url: z
      .string()
      .trim()
      .url()
      .nullable()
      .optional()
      .refine((value) => !value || value.startsWith("https://"), "Webhook URL must use HTTPS."),
  })
  .strict();

async function requireAdmin(context: SupabaseAuthContext) {
  const { requireDeveloperAdmin: check } = await import("@/lib/rbac.server");
  await check(context.supabase, context.userId);
}

export const getDeveloperConfig = createServerFn({ method: "GET" })
  .middleware([requireDeveloperAccess])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data: keys, error: keysError } = await context.supabase
      .from("api_keys")
      .select("id, name, scopes, key_prefix, created_at, expires_at, last_used_at, revoked_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (keysError) throw new Error(`Failed to load API keys: ${keysError.message}`);

    const { data: settings, error: settingsError } = await context.supabase
      .from("workflow_settings")
      .select(
        "auto_parse_resumes, auto_match_on_requirement, auto_draft_submission_email, interview_reminders, match_score_threshold, webhook_url",
      )
      .maybeSingle();
    if (settingsError)
      throw new Error(`Failed to load workflow settings: ${settingsError.message}`);

    return { keys: keys ?? [], settings: settings ?? null };
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .validator((i: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        scopes: z
          .array(z.enum(["read", "write", "admin"]))
          .min(1)
          .max(3),
        expires_in_days: z.number().int().min(1).max(3650).nullable().optional(),
      })
      .strict()
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const raw = `sfx_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const prefix = raw.slice(0, 12);
    const key_hash = await sha256(raw);
    const expires_at = data.expires_in_days
      ? new Date(Date.now() + data.expires_in_days * 86400000).toISOString()
      : null;

    const { data: created, error } = await context.supabase
      .from("api_keys")
      .insert({
        name: data.name,
        scopes: data.scopes,
        key_prefix: prefix,
        key_hash,
        expires_at,
        created_by: context.userId,
      })
      .select("id, name, scopes, key_prefix, created_at, expires_at, last_used_at, revoked_at")
      .single();
    if (error) throw new Error(`Failed to create API key: ${error.message}`);

    const { writeAudit } = await import("@/lib/audit.server");
    await writeAudit({
      actorId: context.userId,
      actorEmail: typeof context.claims.email === "string" ? context.claims.email : null,
      action: "api_key.created",
      entityType: "api_key",
      entityId: created.id,
      metadata: { name: data.name, scopes: data.scopes },
    });

    // The raw secret is returned once and is never persisted.
    return { key: created, secret: raw };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .validator((i: unknown) => z.object({ id: z.string().uuid() }).strict().parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { data: row, error } = await context.supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Failed to revoke API key: ${error.message}`);
    if (!row) throw new Error("API key not found or access denied");
    return { ok: true };
  });

export const updateWorkflowSettings = createServerFn({ method: "POST" })
  .middleware([requireDeveloperAccess])
  .validator((i: unknown) => WorkflowSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(`Failed to resolve tenant: ${profileError.message}`);
    if (!profile?.tenant_id) throw new Error("No tenant is assigned to this account.");

    const { data: settings, error } = await context.supabase
      .from("workflow_settings")
      .upsert(
        { ...data, tenant_id: profile.tenant_id, updated_at: new Date().toISOString() },
        { onConflict: "tenant_id" },
      )
      .select(
        "auto_parse_resumes, auto_match_on_requirement, auto_draft_submission_email, interview_reminders, match_score_threshold, webhook_url",
      )
      .single();
    if (error) throw new Error(`Failed to update workflow settings: ${error.message}`);
    return { ok: true, settings };
  });
