BEGIN;

-- A valid JWT is not sufficient application authorization. Keep direct
-- PostgREST/RPC access aligned with the server middleware by requiring the
-- caller's application profile to remain active.
CREATE OR REPLACE FUNCTION private.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION private.has_role(requested_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    JOIN public.user_roles AS ur ON ur.user_id = p.id
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active = true
      AND ur.role = requested_role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    JOIN public.user_roles AS ur ON ur.user_id = p.id
    WHERE p.id = _user_id
      AND p.is_active = true
      AND ur.role = _role
  );
$$;

REVOKE ALL ON FUNCTION private.is_active_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_active_user() TO authenticated;
REVOKE ALL ON FUNCTION private.has_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(public.app_role) TO authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

DROP POLICY IF EXISTS profiles_select_same_tenant ON public.profiles;
CREATE POLICY profiles_select_same_tenant ON public.profiles
FOR SELECT TO authenticated
USING (
  (SELECT private.is_active_user())
  AND (
    id = (SELECT auth.uid())
    OR (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()))
    OR (SELECT private.is_platform_admin())
  )
);

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
FOR UPDATE TO authenticated
USING ((SELECT private.is_active_user()) AND id = (SELECT auth.uid()))
WITH CHECK (
  (SELECT private.is_active_user())
  AND id = (SELECT auth.uid())
  AND tenant_id IS NOT DISTINCT FROM (SELECT private.current_tenant_id())
);

DROP POLICY IF EXISTS profiles_admin_update_same_tenant ON public.profiles;
CREATE POLICY profiles_admin_update_same_tenant ON public.profiles
FOR UPDATE TO authenticated
USING (
  (SELECT private.is_active_user())
  AND (
    (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()))
    OR (SELECT private.is_platform_admin())
  )
)
WITH CHECK (
  (SELECT private.is_active_user())
  AND (
    (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()))
    OR (SELECT private.is_platform_admin())
  )
);

DROP POLICY IF EXISTS user_roles_select_same_tenant ON public.user_roles;
CREATE POLICY user_roles_select_same_tenant ON public.user_roles
FOR SELECT TO authenticated
USING (
  (SELECT private.is_active_user())
  AND (
    user_id = (SELECT auth.uid())
    OR (SELECT private.is_platform_admin())
    OR EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = user_roles.user_id
        AND p.tenant_id = (SELECT private.current_tenant_id())
        AND (SELECT private.is_admin())
    )
  )
);

DROP POLICY IF EXISTS platform_admins_select_self_or_platform ON public.platform_admins;
CREATE POLICY platform_admins_select_self_or_platform ON public.platform_admins
FOR SELECT TO authenticated
USING (
  (SELECT private.is_active_user())
  AND (user_id = (SELECT auth.uid()) OR (SELECT private.is_platform_admin()))
);

DROP POLICY IF EXISTS platform_access_requests_insert_self ON public.platform_access_requests;
CREATE POLICY platform_access_requests_insert_self ON public.platform_access_requests
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT private.is_active_user())
  AND user_id = (SELECT auth.uid())
  AND status = 'pending'::public.access_request_status
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND review_note IS NULL
  AND (
    tenant_id IS NULL
    OR tenant_id = (SELECT private.current_tenant_id())
  )
);

DROP POLICY IF EXISTS platform_access_requests_select_self_or_platform
  ON public.platform_access_requests;
CREATE POLICY platform_access_requests_select_self_or_platform ON public.platform_access_requests
FOR SELECT TO authenticated
USING (
  (SELECT private.is_active_user())
  AND (user_id = (SELECT auth.uid()) OR (SELECT private.is_platform_admin()))
);

DROP POLICY IF EXISTS platform_access_requests_update_platform
  ON public.platform_access_requests;
CREATE POLICY platform_access_requests_update_platform ON public.platform_access_requests
FOR UPDATE TO authenticated
USING ((SELECT private.is_active_user()) AND (SELECT private.is_platform_admin()))
WITH CHECK ((SELECT private.is_active_user()) AND (SELECT private.is_platform_admin()));

COMMIT;
