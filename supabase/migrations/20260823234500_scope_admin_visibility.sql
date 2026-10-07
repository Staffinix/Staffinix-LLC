BEGIN;

DROP POLICY IF EXISTS profiles_select_self_or_admin ON public.profiles;
CREATE POLICY profiles_select_same_tenant ON public.profiles
FOR SELECT TO authenticated
USING (
  id = (SELECT auth.uid())
  OR (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()))
  OR (SELECT private.is_platform_admin())
);

DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;
CREATE POLICY profiles_admin_update_same_tenant ON public.profiles
FOR UPDATE TO authenticated
USING (
  (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()))
  OR (SELECT private.is_platform_admin())
)
WITH CHECK (
  (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()))
  OR (SELECT private.is_platform_admin())
);

DROP POLICY IF EXISTS user_roles_select_self_or_admin ON public.user_roles;
CREATE POLICY user_roles_select_same_tenant ON public.user_roles
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (SELECT private.is_platform_admin())
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = user_roles.user_id
      AND p.tenant_id = (SELECT private.current_tenant_id())
      AND (SELECT private.is_admin())
  )
);

DROP POLICY IF EXISTS platform_admins_select_self_or_platform ON public.platform_admins;
CREATE POLICY platform_admins_select_self_or_platform ON public.platform_admins
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR (SELECT private.is_platform_admin()));

COMMIT;
