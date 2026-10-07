import { createMiddleware } from "@tanstack/react-start";

import { supabase } from "./client";

export const serverFunctionAuth = createMiddleware({
  type: "function",
}).client(async ({ next }) => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error("Authentication required.");
  }

  return next({
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
});
