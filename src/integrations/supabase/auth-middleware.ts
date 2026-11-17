import { createMiddleware } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";

import { ForbiddenError } from "@/lib/authorization-policy";
import { canAccessFeature, type Feature } from "@/lib/feature-access";
import { setRequestErrorCode } from "@/lib/request-observability";
import { toApplicationError } from "@/lib/application-error";
import { invalidateTenantCache } from "@/lib/cache.server";
import { authenticateRequest } from "./authenticate-request";

export { UnauthorizedError } from "./auth-header";
export type { SupabaseAuthContext } from "./authenticate-request";

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
const readOnlyRequests = new WeakSet<Request>();

/**
 * Add after the access middleware on a POST server function that only reads
 * (a list or search that takes its filters in the body), so calling it does
 * not invalidate the tenant's cached reads. Never add it to a function that
 * writes: src/lib/read-only-server-fns.test.ts enforces this.
 */
export const readOnlyServerFn = createMiddleware({ type: "function" }).server(async ({ next }) => {
  readOnlyRequests.add(getRequest());
  return next();
});

export const requireSupabaseAuth = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const request = getRequest();
  let tenantId: string | null = null;

  try {
    const authContext = await authenticateRequest(request);
    tenantId = authContext.tenantId;
    return await next({
      context: {
        supabase: authContext.supabase,
        userId: authContext.userId,
        tenantId: authContext.tenantId,
        user: authContext.user,
        claims: authContext.claims,
        access: authContext.access,
      },
    });
  } catch (error) {
    // The framework sends a failed server function as HTTP 200 with the error in
    // the body. Record the real outcome so logs and monitoring can see denials
    // and failures; the client reads the body either way.
    if (!(error instanceof Response)) {
      const publicError = toApplicationError(error);
      setResponseStatus(publicError.status);
      setRequestErrorCode(request, publicError.code);
    }
    throw error;
  } finally {
    // Any non-GET server function may have written tenant data, even if it later
    // failed, so drop the tenant's cached reads. No-op when Redis is not configured.
    if (request.method !== "GET" && !readOnlyRequests.has(request)) {
      await invalidateTenantCache(tenantId);
    }
  }
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
      // Role assignments were loaded once during authentication.
      if (!context.access) {
        throw new ForbiddenError("Unable to verify feature permissions.");
      }

      if (!canAccessFeature(context.access, feature)) {
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
