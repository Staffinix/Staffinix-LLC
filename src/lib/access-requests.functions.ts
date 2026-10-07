import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLATFORM_ROLES = ["platform_owner", "platform_admin", "platform_support"] as const;
const RequestSchema = z
  .object({
    requestedRole: z.enum(PLATFORM_ROLES).default("platform_support"),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

export const getMyAccessRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("platform_access_requests")
      .select("id, requested_role, reason, status, review_note, reviewed_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(`Failed to load access requests: ${error.message}`);
    return { requests: data ?? [], platformRole: null, isPlatformStaff: false };
  });

export const requestPlatformAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => RequestSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("platform_access_requests")
      .insert({
        user_id: context.userId,
        user_email: context.user.email ?? null,
        requested_role: data.requestedRole,
        reason: data.reason ?? null,
      })
      .select("id, requested_role, reason, status, created_at")
      .single();
    if (error) throw new Error(`Failed to submit access request: ${error.message}`);
    return row;
  });

export const listAccessRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requirePlatformAdmin } = await import("@/lib/platform-auth.server");
    await requirePlatformAdmin(context.supabase, context.userId);

    const { data, error } = await context.supabase
      .from("platform_access_requests")
      .select("id, user_id, user_email, requested_role, reason, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && data) return data;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: adminData, error: adminErr } = await supabaseAdmin
      .from("platform_access_requests")
      .select("id, user_id, user_email, requested_role, reason, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (adminErr) throw new Error(`Failed to load access requests: ${adminErr.message}`);
    return adminData ?? [];
  });

export const reviewAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().trim().max(1000).optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { requirePlatformAdmin } = await import("@/lib/platform-auth.server");
    await requirePlatformAdmin(context.supabase, context.userId);

    const status = data.approve ? "approved" : "denied";
    const { data: row, error } = await context.supabase
      .from("platform_access_requests")
      .update({
        status,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.note ?? null,
      })
      .eq("id", data.id)
      .select("id, status, reviewed_at")
      .maybeSingle();

    let finalRow = row;

    if (error || !finalRow) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: adminRow, error: adminErr } = await supabaseAdmin
        .from("platform_access_requests")
        .update({
          status,
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
          review_note: data.note ?? null,
        })
        .eq("id", data.id)
        .select("id, status, reviewed_at")
        .maybeSingle();
      if (adminErr) throw new Error(`Failed to review access request: ${adminErr.message}`);
      finalRow = adminRow;
    }

    if (!finalRow) throw new Error("Access request not found or already inaccessible");
    return finalRow;
  });
