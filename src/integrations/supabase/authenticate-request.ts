import { createClient, type JwtPayload, type User } from "@supabase/supabase-js";

import type { Database } from "./types";
import { extractAccessToken, UnauthorizedError } from "./auth-header.ts";
import { assertPublishableSupabaseKey, isOpaquePublishableKey } from "./api-key-safety.ts";
import { ForbiddenError } from "../../lib/authorization-policy.ts";
import { setAuthenticatedRequestContext } from "../../lib/request-observability.ts";
import { isAllowedWorkEmail, parseEmailPolicyList } from "../../lib/work-email-policy.ts";

/**
 * ============================================================================
 * Server-side Supabase configuration
 * ============================================================================
 *
 * These values MUST come from server environment variables. Never hardcode the
 * project URL, any key, user IDs, emails or passwords.
 */
function getRequiredEnv(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`[Supabase Auth] Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function getSupabaseConfig() {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL", process.env.SUPABASE_URL);

  const supabasePublishableKey = getRequiredEnv(
    "SUPABASE_PUBLISHABLE_KEY",
    process.env.SUPABASE_PUBLISHABLE_KEY,
  );
  assertPublishableSupabaseKey(supabasePublishableKey);

  return { supabaseUrl, supabasePublishableKey };
}

/**
 * Sends the publishable key in the `apikey` header and never as
 * `Authorization: Bearer <publishable-key>`. It does not authenticate the user;
 * the user's access token travels separately in the Authorization header.
 */
function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        headers.set(key, value);
      });
    }

    if (
      isOpaquePublishableKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);

    return fetch(input, { ...init, headers });
  };
}

/**
 * Reads the payload of a JWT. Only call this on a token Supabase Auth has just
 * accepted: it does not verify the signature.
 */
export function decodeJwtPayload(token: string): JwtPayload {
  const segment = token.split(".")[1] ?? "";
  const base64 = segment.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as JwtPayload;
}

export interface SupabaseAuthContext {
  /** Authenticated Supabase user ID. Comes ONLY from the validated access token. */
  userId: string;

  /** Tenant of the caller's active profile, loaded from the database. */
  tenantId: string | null;

  /** Complete authenticated Supabase user. */
  user: User;

  /** Claims of the access token Supabase Auth accepted. */
  claims: JwtPayload;

  /**
   * The caller's role assignments, read with the caller's session (RLS applies).
   * Null when they could not be read; feature checks must then deny access.
   */
  access: { roles: string[]; platformRole: string | null } | null;

  /** Supabase client configured for this authenticated request. */
  supabase: ReturnType<typeof createClient<Database>>;
}

/**
 * ============================================================================
 * The authentication boundary
 * ============================================================================
 *
 * Identity comes exclusively from Supabase. Never trust the request body, query
 * parameters, x-user-id headers, localStorage, arbitrary cookies, or hardcoded
 * IDs and emails.
 *
 * Two sequential round trips: Supabase Auth validates the token, then the
 * profile and role assignments are read in parallel.
 */
export async function authenticateRequest(request: Request): Promise<SupabaseAuthContext> {
  const accessToken = extractAccessToken(request);
  const { supabaseUrl, supabasePublishableKey } = getSupabaseConfig();

  const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
    global: {
      fetch: createSupabaseFetch(supabasePublishableKey),
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Supabase Auth checks the signature, expiry and that the session still exists.
  // Invalid token or no user = reject. NEVER continue with a default user.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);

  if (userError) {
    throw new UnauthorizedError("Invalid or expired authentication token.");
  }
  if (!user?.id) {
    throw new UnauthorizedError("Authenticated user could not be resolved.");
  }

  // getUser just accepted this exact token, so its claims can be read without a
  // second verification round trip (supabase-js getClaims does the same after
  // its own getUser fallback).
  let claims: JwtPayload;
  try {
    claims = decodeJwtPayload(accessToken);
  } catch {
    throw new UnauthorizedError("Unable to validate authentication claims.");
  }
  if (typeof claims.sub !== "string" || claims.sub !== user.id) {
    throw new UnauthorizedError("Invalid authentication identity.");
  }

  const userId = user.id;
  const [
    { data: profile, error: profileError },
    { data: assignedRoles, error: rolesError },
    { data: platform, error: platformError },
  ] = await Promise.all([
    supabase.from("profiles").select("is_active, tenant_id").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("platform_admins").select("role").eq("user_id", userId).maybeSingle(),
  ]);

  if (profileError || profile?.is_active !== true) {
    throw new ForbiddenError("This account is inactive or is not authorized for the application.");
  }

  const access =
    rolesError || platformError
      ? null
      : {
          roles: (assignedRoles ?? []).map((row) => row.role),
          platformRole: platform?.role ?? null,
        };

  // Existing members can be provisioned with an exact role assignment even when
  // their mailbox uses another consumer domain. Gmail is allowed by policy;
  // other personal-email signups remain blocked while provisioned members can
  // authenticate without relying on deployment-specific allowlist formatting.
  const hasAllowedWorkEmail = isAllowedWorkEmail(user.email, {
    allowedEmails: parseEmailPolicyList(process.env.AUTH_EMAIL_ALLOWLIST),
    allowedDomains: parseEmailPolicyList(process.env.AUTH_ALLOWED_WORK_EMAIL_DOMAINS),
  });
  if (!hasAllowedWorkEmail && (!access || (!access.roles.length && !access.platformRole))) {
    throw new ForbiddenError(
      "Use a Gmail address or an authorized work email to access Staffinix.",
    );
  }

  setAuthenticatedRequestContext(request, userId, profile.tenant_id);

  return { supabase, userId, tenantId: profile.tenant_id, user, claims, access };
}
