import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient, type JwtPayload, type User } from "@supabase/supabase-js";

import type { Database } from "./types";
import { extractAccessToken, UnauthorizedError } from "./auth-header";
import { ForbiddenError } from "@/lib/authorization-policy";
import { canAccessFeature, type Feature } from "@/lib/feature-access";
import { assertPublishableSupabaseKey, isOpaquePublishableKey } from "./api-key-safety";
import { setAuthenticatedRequestContext } from "@/lib/request-observability";
import { isAllowedWorkEmail, parseEmailPolicyList } from "@/lib/work-email-policy";

export { UnauthorizedError } from "./auth-header";

/**
 * ============================================================================
 * Server-side Supabase configuration
 * ============================================================================
 *
 * IMPORTANT:
 *
 * These values MUST come from server environment variables.
 *
 * Never hardcode:
 * - Supabase project URL
 * - Supabase publishable key
 * - Supabase secret/service-role key
 * - user IDs
 * - user emails
 * - passwords
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

  return {
    supabaseUrl,
    supabasePublishableKey,
  };
}

/**
 * ============================================================================
 * Supabase API key compatibility
 * ============================================================================
 *
 * This user-scoped client supports publishable keys only.
 *
 * The API key belongs in the `apikey` header.
 *
 * The user's authentication token is supplied separately through:
 *
 *   Authorization: Bearer <access-token>
 */
/**
 * Creates a fetch wrapper that ensures the Supabase API key
 * is sent correctly.
 *
 * This function does NOT authenticate the user.
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

    /**
     * Never accidentally send the publishable key as:
     *
     * Authorization: Bearer <publishable-key>
     */
    if (
      isOpaquePublishableKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);

    return fetch(input, {
      ...init,
      headers,
    });
  };
}

/**
 * ============================================================================
 * Authentication types
 * ============================================================================
 */

export interface SupabaseAuthContext {
  /**
   * Authenticated Supabase user ID.
   *
   * This value comes ONLY from the validated Supabase access token.
   */
  userId: string;

  /**
   * Complete authenticated Supabase user.
   */
  user: User;

  /**
   * Validated JWT claims.
   */
  claims: JwtPayload;

  /**
   * Supabase client configured for this authenticated request.
   */
  supabase: ReturnType<typeof createClient<Database>>;
}

/**
 * ============================================================================
 * Authentication errors
 * ============================================================================
 */

/**
 * ============================================================================
 * Validate authentication with Supabase
 * ============================================================================
 *
 * This is the authentication boundary.
 *
 * Identity comes exclusively from Supabase.
 *
 * Never trust:
 * - request body
 * - query parameters
 * - x-user-id headers
 * - localStorage
 * - arbitrary cookies
 * - hardcoded IDs
 * - hardcoded emails
 */
async function authenticateRequest(request: Request): Promise<SupabaseAuthContext> {
  const accessToken = extractAccessToken(request);

  const { supabaseUrl, supabasePublishableKey } = getSupabaseConfig();

  /**
   * Create a server-side Supabase client.
   *
   * The user's access token is explicitly attached
   * as the Authorization Bearer token.
   */
  const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
    global: {
      fetch: createSupabaseFetch(supabasePublishableKey),

      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },

    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  /**
   * ==========================================================================
   * Validate access token
   * ==========================================================================
   *
   * Supabase validates the token and returns
   * the authoritative authenticated user.
   */
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);

  /**
   * Invalid token = reject request.
   *
   * NEVER continue with a default user.
   */
  if (userError) {
    throw new UnauthorizedError("Invalid or expired authentication token.");
  }

  /**
   * No user = reject request.
   */
  if (!user) {
    throw new UnauthorizedError("Authenticated user could not be resolved.");
  }

  /**
   * User ID MUST come from Supabase.
   */
  const userId = user.id;

  if (!userId) {
    throw new UnauthorizedError("Authenticated user has no valid ID.");
  }

  /**
   * ==========================================================================
   * Retrieve validated JWT claims
   * ==========================================================================
   */
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(accessToken);

  if (claimsError || !claimsData?.claims) {
    throw new UnauthorizedError("Unable to validate authentication claims.");
  }

  const claims = claimsData.claims as JwtPayload;

  /**
   * ==========================================================================
   * Verify JWT subject matches authenticated user
   * ==========================================================================
   */
  if (typeof claims.sub !== "string" || claims.sub !== userId) {
    throw new UnauthorizedError("Invalid authentication identity.");
  }

  const hasAllowedWorkEmail = isAllowedWorkEmail(user.email, {
    allowedEmails: parseEmailPolicyList(process.env.AUTH_EMAIL_ALLOWLIST),
    allowedDomains: parseEmailPolicyList(process.env.AUTH_ALLOWED_WORK_EMAIL_DOMAINS),
  });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active, tenant_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || profile?.is_active !== true) {
    throw new ForbiddenError("This account is inactive or is not authorized for the application.");
  }

  // Existing members can be provisioned with an exact role assignment even when
  // their mailbox uses a consumer domain. This keeps personal-email signups
  // blocked while allowing explicitly provisioned member accounts to
  // authenticate without relying on deployment-specific allowlist formatting.
  if (!hasAllowedWorkEmail) {
    const [{ data: assignedRole, error: roleError }, { data: platformRole, error: platformError }] =
      await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId).limit(1).maybeSingle(),
        supabase.from("platform_admins").select("role").eq("user_id", userId).maybeSingle(),
      ]);

    if (roleError || platformError || (!assignedRole && !platformRole)) {
      throw new ForbiddenError("Use an authorized work email account to access Staffinix.");
    }
  }

  setAuthenticatedRequestContext(request, userId, profile.tenant_id);

  return {
    supabase,
    userId,
    user,
    claims,
  };
}

/**
 * ============================================================================
 * Supabase authentication middleware
 * ============================================================================
 *
 * Every createServerFn() that uses:
 *
 *   .middleware([requireSupabaseAuth])
 *
 * must provide a valid authenticated Supabase
 * access token.
 *
 * No hardcoded user.
 * No fallback user.
 * No fake authentication.
 */
export const requireSupabaseAuth = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const request = getRequest();
  const authContext = await authenticateRequest(request);

  return next({
    context: {
      supabase: authContext.supabase,
      userId: authContext.userId,
      user: authContext.user,
      claims: authContext.claims,
    },
  });
});

/**
 * Authenticates the request and authorizes a product feature from database-backed
 * role assignments. Keeping this at the server-function boundary prevents a
 * caller from bypassing the sidebar or route guard with a crafted request.
 */
export function requireFeatureAccess(feature: Feature) {
  return createMiddleware({ type: "function" })
    .middleware([requireSupabaseAuth])
    .server(async ({ next, context }) => {
      const [{ data: assignedRoles, error: rolesError }, { data: platform, error: platformError }] =
        await Promise.all([
          context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
          context.supabase
            .from("platform_admins")
            .select("role")
            .eq("user_id", context.userId)
            .maybeSingle(),
        ]);

      if (rolesError || platformError) {
        throw new ForbiddenError("Unable to verify feature permissions.");
      }

      if (
        !canAccessFeature(
          {
            roles: (assignedRoles ?? []).map((row) => row.role),
            platformRole: platform?.role ?? null,
          },
          feature,
        )
      ) {
        throw new ForbiddenError(`Your assigned role cannot access the ${feature} feature.`);
      }

      return next();
    });
}

export const requireDashboardAccess = requireFeatureAccess("dashboard");
export const requireCandidatesAccess = requireFeatureAccess("candidates");
export const requireRequirementsAccess = requireFeatureAccess("requirements");
export const requireMatchingAccess = requireFeatureAccess("matching");
export const requireTailoringAccess = requireFeatureAccess("tailoring");
export const requireSubmissionsAccess = requireFeatureAccess("submissions");
export const requireInterviewsAccess = requireFeatureAccess("interviews");
export const requireClientsAccess = requireFeatureAccess("clients");
export const requireVendorsAccess = requireFeatureAccess("vendors");
export const requirePlacementsAccess = requireFeatureAccess("placements");
export const requireRecruitersAccess = requireFeatureAccess("recruiters");
export const requireUsersAccess = requireFeatureAccess("users");
export const requireDeveloperAccess = requireFeatureAccess("developer");
export const requireEmailIntelligenceAccess = requireFeatureAccess("email_intelligence");
