// Server-only Supabase service client.
// This module must never be imported by browser/client code.
import { createAdminClient } from "@supabase/server/core";
import type { Database } from "./types";

function createSupabaseServiceClient() {
  // @supabase/server resolves SUPABASE_SECRET_KEYS first, then
  // SUPABASE_SECRET_KEY. It applies server-safe auth settings and never uses a
  // secret key as a browser session. Legacy service-role keys are deliberately
  // unsupported here.
  return createAdminClient<Database>();
}

let serviceClient: ReturnType<typeof createSupabaseServiceClient> | undefined;

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseServiceClient>, {
  get(_, property, receiver) {
    if (!serviceClient) {
      serviceClient = createSupabaseServiceClient();
    }
    return Reflect.get(serviceClient, property, receiver);
  },
});
