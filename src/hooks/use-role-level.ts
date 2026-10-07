import { useProfile } from "@/hooks/use-profile";

/**
 * Read-only presentation of the authorization level resolved by the server.
 *
 * This hook deliberately has no setter and no browser persistence. Navigation
 * may display the server-owned role, but it can never create or override it.
 */
export function useRoleLevel() {
  const { data: profile } = useProfile();

  return {
    level: profile?.level ?? null,
  };
}
