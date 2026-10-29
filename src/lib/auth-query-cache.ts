import type { QueryClient } from "@tanstack/react-query";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

// Auth events also arrive from other tabs, outside the explicit sign-out button.
export function createAuthCacheHandler(queryClient: QueryClient, invalidateRoute: () => void) {
  let userId: string | null = null;
  return (event: AuthChangeEvent, session: Session | null) => {
    const nextUserId = session?.user.id ?? null;
    if (event === "INITIAL_SESSION") {
      userId = nextUserId;
      return;
    }
    if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
    const identityChanged = userId !== nextUserId;
    userId = nextUserId;
    if (event === "SIGNED_OUT" || identityChanged) {
      queryClient.clear();
    } else if (event === "USER_UPDATED") {
      void queryClient.invalidateQueries();
    }
    if (event === "SIGNED_OUT" || identityChanged || event === "USER_UPDATED") invalidateRoute();
  };
}
