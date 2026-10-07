/**
 * Compatibility entry point. Authentication has one implementation so the
 * server-only import cannot drift from the middleware used by server functions.
 */
export { requireSupabaseAuth, UnauthorizedError } from "./auth-middleware";
export type { SupabaseAuthContext } from "./auth-middleware";
