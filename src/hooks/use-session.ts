import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

let signingOut = false;
const signOutListeners = new Set<(value: boolean) => void>();

function setSigningOut(value: boolean) {
  signingOut = value;
  signOutListeners.forEach((listener) => listener(value));
}

export function beginSignOut() {
  setSigningOut(true);
}

export function cancelSignOut() {
  setSigningOut(false);
}

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(signingOut);

  useEffect(() => {
    let active = true;

    const synchronizeUser = async () => {
      const {
        data: { user: verifiedUser },
        error,
      } = await supabase.auth.getUser();

      if (!active) return;
      setUser(error ? null : verifiedUser);
      setReady(true);
      if (!error && verifiedUser) setSigningOut(false);
    };

    signOutListeners.add(setIsSigningOut);
    void synchronizeUser();

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setReady(true);
        setSigningOut(false);
        return;
      }

      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED" ||
        event === "INITIAL_SESSION"
      ) {
        queueMicrotask(() => void synchronizeUser());
      }
    });

    return () => {
      active = false;
      signOutListeners.delete(setIsSigningOut);
      data.subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    ready,
    isSigningOut,
    isAuthenticated: ready && Boolean(user) && !isSigningOut,
  };
}
