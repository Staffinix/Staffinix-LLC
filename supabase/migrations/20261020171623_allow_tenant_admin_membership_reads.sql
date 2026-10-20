BEGIN;

CREATE POLICY platform_admins_select_tenant_admin
ON public.platform_admins FOR SELECT TO authenticated
USING (
  (SELECT private.is_active_user())
  AND (SELECT private.is_admin())
  AND EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = platform_admins.user_id
      AND p.tenant_id = (SELECT private.current_tenant_id())
  )
);

COMMENT ON POLICY platform_admins_select_tenant_admin ON public.platform_admins IS
  'Active company administrators may read platform membership metadata only for their tenant. No write access is granted.';

COMMIT;
