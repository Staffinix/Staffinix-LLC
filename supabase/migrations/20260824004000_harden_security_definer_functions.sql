BEGIN;

-- SECURITY DEFINER functions run with their owner's privileges. Keep object
-- resolution deterministic and deny the PostgreSQL default EXECUTE grant to
-- PUBLIC. New functions must be granted deliberately in a reviewed migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER FUNCTION private.current_tenant_id() SET search_path = '';
ALTER FUNCTION private.has_role(public.app_role) SET search_path = '';
ALTER FUNCTION private.is_admin() SET search_path = '';
ALTER FUNCTION private.is_platform_admin() SET search_path = '';
ALTER FUNCTION private.enforce_tenant_integrity() SET search_path = '';

ALTER FUNCTION public.current_tenant_id() SET search_path = '';
ALTER FUNCTION public.has_role(uuid, public.app_role) SET search_path = '';
ALTER FUNCTION public.is_admin(uuid) SET search_path = '';
ALTER FUNCTION public.is_platform_admin(uuid) SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.prevent_candidate_tenant_change() SET search_path = '';
ALTER FUNCTION public.search_candidates_semantic(vector, integer) SET search_path = '';
ALTER FUNCTION public.match_candidates_for_requirement(uuid, integer) SET search_path = '';
ALTER FUNCTION public.match_requirements_for_candidate(uuid, integer) SET search_path = '';

-- Internal RLS helpers bind authorization to auth.uid(). They are available
-- only to authenticated database requests and are not exposed in public RPC.
REVOKE ALL ON FUNCTION private.current_tenant_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_role(public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated;

-- Trigger functions are invoked by PostgreSQL, never directly by API roles.
REVOKE ALL ON FUNCTION private.enforce_tenant_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_candidate_tenant_change() FROM PUBLIC, anon, authenticated;

-- Legacy public authorization wrappers are not application APIs. Keeping them
-- callable by authenticated users would permit direct privileged RPC execution.
REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO service_role;

-- These three functions are intentional authenticated APIs. Each resolves the
-- active caller's tenant internally via private.current_tenant_id(); table RLS
-- is not relied upon inside SECURITY DEFINER execution.
REVOKE ALL ON FUNCTION public.search_candidates_semantic(vector, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_candidates_for_requirement(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_requirements_for_candidate(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_candidates_semantic(vector, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_candidates_for_requirement(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_requirements_for_candidate(uuid, integer) TO authenticated, service_role;

COMMIT;
