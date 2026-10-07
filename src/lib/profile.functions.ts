import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { serverFunctionAuth } from "@/integrations/supabase/server-function-auth";
import { z } from "zod";
import type { RoleLevel } from "@/types/auth";
import { isAllowedProfileAvatarValue } from "@/lib/profile-avatar";
import { resolveProfileAvatarUrl } from "@/lib/profile-avatar.server";

function getRoleLevel(roles: string[], platformRole: string | null): RoleLevel {
  if (platformRole === "platform_owner" || platformRole === "platform_admin") return "L1";
  if (roles.includes("super_admin") || roles.includes("admin")) return "L2";
  if (
    platformRole === "platform_support" ||
    roles.includes("developer_admin") ||
    roles.includes("account_manager") ||
    roles.includes("delivery_manager")
  ) {
    return "L3";
  }
  return "L4";
}

function getRoleTitle(roles: string[], platformRole: string | null): string {
  const role =
    platformRole ??
    [
      "super_admin",
      "admin",
      "developer_admin",
      "delivery_manager",
      "account_manager",
      "recruiter",
      "marketing_executive",
      "user",
    ].find((candidate) => roles.includes(candidate)) ??
    "user";

  return role.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([serverFunctionAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, avatar_url, tenant_id, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error("Unable to load the authenticated profile.");
    if (!profile?.is_active) throw new Error("Account is inactive or unavailable");

    const [{ data: rolesData, error: rolesErr }, { data: platform, error: platformError }] =
      await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("platform_admins").select("role").eq("user_id", userId).maybeSingle(),
      ]);

    if (rolesErr) throw new Error("Unable to load assigned roles.");
    if (platformError) throw new Error("Unable to load platform membership.");

    const userEmail =
      profile.email || context.user?.email || (claims.email as string | undefined) || null;

    const userFullName =
      profile.full_name ||
      (context.user?.user_metadata?.full_name as string | undefined) ||
      (context.user?.user_metadata?.name as string | undefined) ||
      (userEmail
        ? userEmail
            .split("@")[0]
            .replace(/[._-]/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
        : "User");

    const storedAvatarUrl =
      profile.avatar_url ||
      (context.user?.user_metadata?.avatar_url as string | undefined) ||
      (context.user?.user_metadata?.picture as string | undefined) ||
      null;
    const userAvatarUrl = await resolveProfileAvatarUrl(supabase, storedAvatarUrl);

    const userPhone =
      profile.phone ||
      context.user?.phone ||
      (context.user?.user_metadata?.phone as string | undefined) ||
      null;

    const roles = (rolesData ?? []).map((row) => row.role);
    const platformRole = platform?.role ?? null;
    const resolvedLevel =
      roles.length > 0 || platformRole ? getRoleLevel(roles, platformRole) : null;

    return {
      profile: {
        id: profile.id,
        full_name: userFullName,
        email: userEmail,
        phone: userPhone,
        avatar_url: userAvatarUrl,
      },
      roles,
      email: userEmail,
      userId,
      tenantId: profile.tenant_id,
      platformRole,
      isPlatformStaff: platformRole !== null,
      level: resolvedLevel,
      roleTitle: getRoleTitle(roles, platformRole),
    };
  });

const UpdateProfileSchema = z
  .object({
    full_name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    avatar_url: z
      .string()
      .trim()
      .max(500)
      .refine(isAllowedProfileAvatarValue, "Use an HTTPS image URL or an uploaded profile photo.")
      .nullable()
      .optional(),
  })
  .strict();

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([serverFunctionAuth, requireSupabaseAuth])
  .validator((input: unknown) => UpdateProfileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { data: updated, error } = await supabase
      .from("profiles")
      .update({
        ...(data.full_name !== undefined ? { full_name: data.full_name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.avatar_url !== undefined ? { avatar_url: data.avatar_url } : {}),
      })
      .eq("id", userId)
      .select("id, full_name, email, phone, avatar_url")
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { writeAudit } = await import("@/lib/audit.server");
    await writeAudit({
      actorId: userId,
      actorEmail: (claims.email as string | undefined) ?? null,
      action: "profile.updated",
      entityType: "profile",
      entityId: userId,
      metadata: { fields: Object.keys(data) },
    });

    return updated;
  });
