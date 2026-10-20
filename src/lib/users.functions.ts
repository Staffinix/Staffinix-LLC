import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUsersAccess } from "@/integrations/supabase/auth-middleware";
import type { SupabaseAuthContext } from "@/integrations/supabase/auth-middleware";

import {
  APP_ROLES,
  ASSIGNABLE_USER_ROLES,
  assertTeamAdmin,
  assertCanAssignTeamRole,
  isL1Owner,
  isCompanyTeamMember,
  type PlatformRole,
} from "@/lib/authorization-policy";
import { resolveProfileAvatarUrls } from "@/lib/profile-avatar.server";

const AppRoleSchema = z.enum(APP_ROLES);

async function requireAdminContext(context: SupabaseAuthContext) {
  const { getUserRoles } = await import("@/lib/rbac.server");
  const roles = await getUserRoles(context.supabase, context.userId);
  const [{ data: caller, error }, { data: platform, error: platformError }] = await Promise.all([
    context.supabase
      .from("profiles")
      .select("tenant_id, is_active")
      .eq("id", context.userId)
      .maybeSingle(),
    context.supabase
      .from("platform_admins")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle(),
  ]);
  if (error || platformError) throw new Error("Unable to resolve administrator context.");
  if (!caller?.tenant_id) throw new Error("Administrator is not assigned to a tenant.");
  assertTeamAdmin({
    active: caller.is_active,
    tenantId: caller.tenant_id,
    roles,
    platformRole: platform?.role ?? null,
  });
  return { roles, tenantId: caller.tenant_id, platformRole: platform?.role ?? null };
}

async function getPlatformRoles(userIds: string[]): Promise<Map<string, PlatformRole>> {
  if (!userIds.length) return new Map();
  // IDs come only from the authenticated, tenant-scoped profile lookup.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_admins")
    .select("user_id, role")
    .in("user_id", userIds);
  if (error) throw new Error("Unable to resolve platform memberships.");
  return new Map((data ?? []).map((row) => [row.user_id, row.role]));
}

async function resolveTarget(context: SupabaseAuthContext, targetUserId: string) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("id, tenant_id")
    .eq("id", targetUserId)
    .maybeSingle();
  if (error) throw new Error("Unable to resolve target user.");
  if (!data) throw new Error("Unable to resolve target user.");
  const { data: roles, error: rolesError } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", targetUserId);
  if (rolesError) throw new Error("Unable to resolve target roles.");
  const platformRoles = await getPlatformRoles([targetUserId]);
  return {
    tenantId: data.tenant_id,
    roles: (roles ?? []).map((row) => row.role),
    platformRole: platformRoles.get(targetUserId) ?? null,
  };
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireUsersAccess])
  .handler(async ({ context }) => {
    const { tenantId, platformRole } = await requireAdminContext(context);
    let profilesQuery = context.supabase
      .from("profiles")
      .select("id, email, full_name, phone, avatar_url, is_active, created_at, tenant_id")
      .order("created_at", { ascending: false })
      .limit(100);
    profilesQuery =
      platformRole === "platform_owner"
        ? profilesQuery.or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
        : profilesQuery.eq("tenant_id", tenantId);
    const { data: profiles, error } = await profilesQuery;
    if (error) throw new Error("Failed to load users.");

    const ids = (profiles ?? []).map((p) => p.id);
    const { data: roles, error: rolesError } = ids.length
      ? await context.supabase.from("user_roles").select("user_id, role").in("user_id", ids)
      : { data: [], error: null };
    if (rolesError) throw new Error("Failed to load user roles.");
    const platformRoles = await getPlatformRoles(ids);

    const rolesByUser = new Map<string, string[]>();
    for (const row of roles ?? [])
      rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) ?? []), row.role]);

    const teamProfiles = (profiles ?? []).filter(
      (profile) =>
        isL1Owner(platformRole) ||
        (!platformRoles.has(profile.id) && isCompanyTeamMember(rolesByUser.get(profile.id) ?? [])),
    );
    const safeProfiles = await resolveProfileAvatarUrls(context.supabase, teamProfiles);
    return safeProfiles.map((profile) => ({
      ...profile,
      last_sign_in_at: null,
      roles: rolesByUser.get(profile.id) ?? [],
      platformRole: platformRoles.get(profile.id) ?? null,
    }));
  });

const InviteSchema = z
  .object({
    email: z.string().trim().email().max(255),
    full_name: z.string().trim().min(1).max(120),
    role: AppRoleSchema,
  })
  .strict();

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireUsersAccess])
  .validator((input: unknown) => InviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { roles, tenantId, platformRole } = await requireAdminContext(context);
    assertCanAssignTeamRole({ active: true, tenantId, roles, platformRole }, data.role);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      { data: { full_name: data.full_name } },
    );
    if (inviteError || !invited.user) throw new Error("Failed to invite user.");

    const userId = invited.user.id;
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.full_name, tenant_id: tenantId })
      .eq("id", userId);
    if (profileError) throw new Error("Failed to assign invited user to tenant.");

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (roleError) throw new Error("Failed to assign invited user role.");

    return { id: userId, email: data.email };
  });

const UpdateRoleSchema = z
  .object({ user_id: z.string().uuid(), role: z.enum(ASSIGNABLE_USER_ROLES) })
  .strict();

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireUsersAccess])
  .validator((input: unknown) => UpdateRoleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { roles, tenantId, platformRole } = await requireAdminContext(context);
    const target = await resolveTarget(context, data.user_id);
    const { assertCanManageUser } = await import("@/lib/authorization-policy");
    assertCanManageUser({
      actor: { active: true, tenantId, roles, platformRole },
      actorId: context.userId,
      targetId: data.user_id,
      targetTenantId: target.tenantId,
      targetRoles: target.roles,
      targetPlatformRole: target.platformRole,
      assignedRole: data.role,
    });

    const { error } = await context.supabase.rpc("set_user_access", {
      _user_id: data.user_id,
      _role: data.role,
    });
    if (error) throw new Error("Failed to update user role.");
    return { ok: true };
  });

const SetActiveSchema = z.object({ user_id: z.string().uuid(), is_active: z.boolean() }).strict();

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireUsersAccess])
  .validator((input: unknown) => SetActiveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, roles, platformRole } = await requireAdminContext(context);
    const target = await resolveTarget(context, data.user_id);
    const { assertCanManageUser } = await import("@/lib/authorization-policy");
    assertCanManageUser({
      actor: { active: true, tenantId, roles, platformRole },
      actorId: context.userId,
      targetId: data.user_id,
      targetTenantId: target.tenantId,
      targetRoles: target.roles,
      targetPlatformRole: target.platformRole,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.is_active })
      .eq("id", data.user_id);
    if (profileError) throw new Error("Failed to update user status.");

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.is_active ? "none" : "876000h",
    });
    if (authError) throw new Error("Failed to update user authentication status.");

    return { ok: true };
  });
