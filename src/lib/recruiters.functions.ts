import { createServerFn } from "@tanstack/react-start";
import { requireRecruitersAccess } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolveProfileAvatarUrl, resolveProfileAvatarUrls } from "@/lib/profile-avatar.server";

export const listRecruiters = createServerFn({ method: "GET" })
  .middleware([requireRecruitersAccess])
  .handler(async ({ context }) => {
    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("user_id, role")
      .limit(500);
    if (rolesError) throw new Error(`Failed to load recruiter roles: ${rolesError.message}`);

    const rolesByUser = new Map<string, string[]>();
    for (const role of roles ?? []) {
      rolesByUser.set(role.user_id, [...(rolesByUser.get(role.user_id) ?? []), role.role]);
    }
    const userIds = [...rolesByUser.keys()];
    if (userIds.length === 0) return [];

    const { data: profiles, error: profilesError } = await context.supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url, is_active, created_at")
      .in("id", userIds)
      .limit(100);
    if (profilesError) throw new Error(`Failed to load recruiters: ${profilesError.message}`);

    const safeProfiles = await resolveProfileAvatarUrls(context.supabase, profiles ?? []);
    return safeProfiles.map((profile) => ({
      ...profile,
      roles: rolesByUser.get(profile.id) ?? [],
      open_requirements: 0,
      submissions: 0,
      interviews: 0,
      placements: 0,
    }));
  });

export interface RecruiterRequirementItem {
  id: string;
  title: string;
  created_at: string;
  status: string;
  priority: string;
}

export interface RecruiterSubmissionItem {
  id: string;
  created_at: string;
  stage: string;
}

export interface RecruiterInterviewItem {
  id: string;
  round: number;
  scheduled_at: string | null;
  outcome: string | null;
}

export interface RecruiterPlacementItem {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
}

export const getRecruiter = createServerFn({ method: "POST" })
  .middleware([requireRecruitersAccess])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url, is_active, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (profileError) throw new Error(`Failed to load recruiter: ${profileError.message}`);
    if (!profile) throw new Error("Recruiter not found or access denied");

    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.id);
    if (rolesError) throw new Error(`Failed to load recruiter roles: ${rolesError.message}`);

    return {
      profile: {
        ...profile,
        avatar_url: await resolveProfileAvatarUrl(context.supabase, profile.avatar_url),
        roles: (roles ?? []).map((role) => role.role),
      },
      requirements: [] as RecruiterRequirementItem[],
      submissions: [] as RecruiterSubmissionItem[],
      interviews: [] as RecruiterInterviewItem[],
      placements: [] as RecruiterPlacementItem[],
    };
  });
