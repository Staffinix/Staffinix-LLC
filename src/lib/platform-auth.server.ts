import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ForbiddenError } from "./authorization-policy.ts";

export function isPlatformAdministratorRole(role: string | null | undefined): boolean {
  return role === "platform_owner" || role === "platform_admin";
}

export async function is_platform_admin(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  if (!userId) return false;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || profile?.is_active !== true) return false;

  const { data, error } = await supabase
    .from("platform_admins")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return false;
  return isPlatformAdministratorRole(data?.role);
}

export async function requirePlatformAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  if (!(await is_platform_admin(supabase, userId))) {
    throw new ForbiddenError("Platform administrator privileges required.");
  }
}
