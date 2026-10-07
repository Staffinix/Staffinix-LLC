import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyProfile } from "@/lib/profile.functions";
import { useSession } from "@/hooks/use-session";

export function useProfile() {
  const getMyProfileFn = useServerFn(getMyProfile);
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: ["me"],
    queryFn: () => getMyProfileFn(),
    enabled: isAuthenticated,
    retry: 3,
    retryDelay: 1000,
    staleTime: 30_000,
  });
}
