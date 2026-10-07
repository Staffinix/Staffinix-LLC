import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getSafeHttpUrl } from "@/lib/safe-url";
import { getProfileAvatarPath, PROFILE_AVATAR_BUCKET } from "@/lib/profile-avatar";

const AVATAR_URL_TTL_SECONDS = 10 * 60;

export async function resolveProfileAvatarUrl(
  supabase: SupabaseClient<Database>,
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  const path = getProfileAvatarPath(value);
  if (!path) return getSafeHttpUrl(value);

  const { data, error } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .createSignedUrl(path, AVATAR_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;
  return getSafeHttpUrl(data.signedUrl);
}

export async function resolveProfileAvatarUrls<T extends { avatar_url?: string | null }>(
  supabase: SupabaseClient<Database>,
  values: T[],
): Promise<T[]> {
  return Promise.all(
    values.map(async (value) => ({
      ...value,
      avatar_url: await resolveProfileAvatarUrl(supabase, value.avatar_url),
    })),
  );
}
