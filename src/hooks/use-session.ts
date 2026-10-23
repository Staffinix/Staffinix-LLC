import type { User } from "@supabase/supabase-js";
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

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

function useVerifiedSession() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(signingOut);

  useEffect(() => {
    let active = true;
    let revision = 0;

    const synchronizeUser = async () => {
      const currentRevision = ++revision;
      const {
        data: { user: verifiedUser },
        error,
      } = await supabase.auth.getUser();

      if (!active || currentRevision !== revision) return;
      setUser(error ? null : verifiedUser);
      setReady(true);
      if (!error && verifiedUser) setSigningOut(false);
    };

    signOutListeners.add(setIsSigningOut);
    void synchronizeUser();

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        revision++;
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

const SessionContext = createContext<ReturnType<typeof useVerifiedSession> | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useVerifiedSession();
  return createElement(SessionContext.Provider, { value: session }, children);
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession requires SessionProvider");
  return session;
}
