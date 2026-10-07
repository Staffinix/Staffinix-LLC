import { getSafeHttpUrl } from "./safe-url.ts";

export const PROFILE_AVATAR_BUCKET = "profile-avatars";
const PROFILE_AVATAR_SCHEME = "staffinix-avatar:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createProfileAvatarReference(userId: string): string {
  if (!UUID_PATTERN.test(userId)) throw new Error("Invalid profile identifier.");
  return `${PROFILE_AVATAR_SCHEME}//${PROFILE_AVATAR_BUCKET}/${userId}/avatar`;
}

export function getProfileAvatarPath(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== PROFILE_AVATAR_SCHEME || url.hostname !== PROFILE_AVATAR_BUCKET) {
      return null;
    }
    const match = url.pathname.match(/^\/([0-9a-f-]+)\/avatar$/i);
    if (!match || !UUID_PATTERN.test(match[1])) return null;
    return `${match[1]}/avatar`;
  } catch {
    return null;
  }
}

export function isAllowedProfileAvatarValue(value: string): boolean {
  return value.length <= 500 && Boolean(getProfileAvatarPath(value) || getSafeHttpUrl(value));
}
