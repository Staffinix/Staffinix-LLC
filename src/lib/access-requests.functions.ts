import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AccessRequestInputSchema } from "@/lib/access-request-tiers";

const ACCESS_REQUEST_SELECT =
  "id, requested_tier, reason, status, review_note, reviewed_at, created_at" as const;

function isUniqueViolation(error: { code?: string | null }): boolean {
  return error.code === "23505";
}

export const getMyAccessRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("platform_access_requests")
      .select(ACCESS_REQUEST_SELECT)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error("Unable to load your access request right now.");
    return { requests: data ?? [] };
  });

export const requestPlatformAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => AccessRequestInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const [assignedRoleResult, platformRoleResult, profileResult] = await Promise.all([
      context.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .limit(1)
        .maybeSingle(),
      context.supabase
        .from("platform_admins")
        .select("role")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase.from("profiles").select("tenant_id").eq("id", context.userId).maybeSingle(),
    ]);

    if (assignedRoleResult.error || platformRoleResult.error || profileResult.error) {
      throw new Error("Unable to verify your account right now.");
    }

    if (assignedRoleResult.data || platformRoleResult.data) {
      throw new Error("Your account already has Staffinix access.");
    }

    const { data: pending, error: pendingError } = await context.supabase
      .from("platform_access_requests")
      .select(ACCESS_REQUEST_SELECT)
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .maybeSingle();
    if (pendingError) throw new Error("Unable to verify your pending request right now.");
    if (pending) return { request: pending, alreadyPending: true };

    const { data: row, error } = await context.supabase
      .from("platform_access_requests")
      .insert({
        user_id: context.userId,
        user_email: context.user.email ?? null,
        tenant_id: profileResult.data?.tenant_id ?? null,
        requested_tier: data.requestedTier,
        reason: data.reason,
      })
      .select(ACCESS_REQUEST_SELECT)
      .single();
    if (!error && row) return { request: row, alreadyPending: false };

    if (error && isUniqueViolation(error)) {
      const { data: existing } = await context.supabase
        .from("platform_access_requests")
        .select(ACCESS_REQUEST_SELECT)
        .eq("user_id", context.userId)
        .eq("status", "pending")
        .maybeSingle();
      if (existing) return { request: existing, alreadyPending: true };
    }

    throw new Error("Unable to submit your request right now. Please try again.");
  });

export const listAccessRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requirePlatformAdmin } = await import("@/lib/platform-auth.server");
    await requirePlatformAdmin(context.supabase, context.userId);

    const { data, error } = await context.supabase
      .from("platform_access_requests")
      .select("id, user_id, user_email, requested_tier, reason, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error("Unable to load access requests right now.");
    return data ?? [];
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

    const { data: rows, error } = await context.supabase.rpc("review_platform_access_request", {
      _request_id: data.id,
      _approve: data.approve,
      _note: data.note ?? null,
    });

    if (error) {
      if (error.code === "42501") throw new Error("You are not authorized to review this request.");
      if (error.code === "P0002") throw new Error("This request is no longer pending.");
      if (error.code === "22023") {
        throw new Error("Assign the requester to a tenant before approving this access tier.");
      }
      throw new Error("Unable to review this request right now. Please try again.");
    }

    const row = rows?.[0];
    if (!row) throw new Error("This request is no longer pending.");
    return row;
  });
