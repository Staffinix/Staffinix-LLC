import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Display names of people in the caller's company. A failed lookup never blocks the page. */
export async function getTeamMemberNames(
  supabase: SupabaseClient<Database>,
  userIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const { data, error } = await supabase.rpc("get_team_member_names", { _user_ids: ids });
  if (error) console.error("[team-names] lookup failed", error.code);
  return new Map((data ?? []).map((row) => [row.id, row.full_name]));
}
