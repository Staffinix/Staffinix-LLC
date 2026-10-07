import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  APP_ROLES,
  assertAdmin,
  assertDeveloperAdmin,
  assertSuperAdmin,
  type AppRole,
  type AuthorizationSnapshot,
} from "@/lib/authorization-policy";

export type { AppRole } from "@/lib/authorization-policy";

const VALID_ROLES = new Set<AppRole>(APP_ROLES);

export async function getUserRoles(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AppRole[]> {
  if (!userId) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, is_active")
    .eq("id", userId)
    .maybeSingle();

  let activeProfile = profile;
  if (!activeProfile) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: adminProfile } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id, is_active")
      .eq("id", userId)
      .maybeSingle();
    activeProfile = adminProfile;
  }

  if (!activeProfile?.is_active) return [];

  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);

  let rolesData = data;
  if (error || !rolesData?.length) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    rolesData = adminRoles;
  }

  return (rolesData ?? [])
    .map((row) => row.role as AppRole)
    .filter((role) => VALID_ROLES.has(role));
}

export function isAdminRole(roles: AppRole[]): boolean {
  return roles.some((role) => role === "admin" || role === "super_admin");
}

export function isSuperAdmin(roles: AppRole[]): boolean {
  return roles.includes("super_admin");
}

export function isDeveloperAdmin(roles: AppRole[]): boolean {
  return roles.some(
    (role) => role === "developer_admin" || role === "super_admin" || role === "admin",
  );
}

export async function requireAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AppRole[]> {
  const roles = await getUserRoles(supabase, userId);
  const snapshot: AuthorizationSnapshot = {
    active: roles.length > 0,
    roles,
    tenantId: null,
    platformRole: null,
  };
  assertAdmin(snapshot);
  return roles;
}

export async function requireDeveloperAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AppRole[]> {
  const roles = await getUserRoles(supabase, userId);
  const snapshot: AuthorizationSnapshot = {
    active: roles.length > 0,
    roles,
    tenantId: null,
    platformRole: null,
  };
  assertDeveloperAdmin(snapshot);
  return roles;
}

export async function requireSuperAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AppRole[]> {
  const roles = await getUserRoles(supabase, userId);
  const snapshot: AuthorizationSnapshot = {
    active: roles.length > 0,
    roles,
    tenantId: null,
    platformRole: null,
  };
  assertSuperAdmin(snapshot);
  return roles;
}
