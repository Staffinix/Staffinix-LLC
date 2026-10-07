BEGIN;

-- Authorization is derived from platform_admins and user_roles. A profile is
-- user-editable, so it must never contain an independently authoritative role
-- level.
-- A browser session may update only presentation/contact fields on profiles.
-- Administrative status, tenant assignment, email, and identity changes flow
-- through authenticated server functions using the server-only admin client.
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone, avatar_url) ON TABLE public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Platform owner reads all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Company admins read profiles" ON public.profiles;
DROP POLICY IF EXISTS profiles_select_self_or_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_read_policy ON public.profiles;
DROP POLICY IF EXISTS profiles_select_same_tenant ON public.profiles;

CREATE POLICY profiles_select_same_tenant ON public.profiles
FOR SELECT TO authenticated
USING (
  (SELECT private.is_active_user())
  AND (
    id = (SELECT auth.uid())
    OR (
      tenant_id = (SELECT private.current_tenant_id())
      AND (SELECT private.is_admin())
    )
    OR (SELECT private.is_platform_admin())
  )
);

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins update all profiles" ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self_policy ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_update_same_tenant ON public.profiles;

CREATE POLICY profiles_update_self ON public.profiles
FOR UPDATE TO authenticated
USING (
  (SELECT private.is_active_user())
  AND id = (SELECT auth.uid())
)
WITH CHECK (
  (SELECT private.is_active_user())
  AND id = (SELECT auth.uid())
  AND tenant_id IS NOT DISTINCT FROM (SELECT private.current_tenant_id())
);

CREATE POLICY profiles_admin_update_same_tenant ON public.profiles
FOR UPDATE TO authenticated
USING (
  (SELECT private.is_active_user())
  AND tenant_id = (SELECT private.current_tenant_id())
  AND (SELECT private.is_admin())
)
WITH CHECK (
  (SELECT private.is_active_user())
  AND tenant_id = (SELECT private.current_tenant_id())
  AND (SELECT private.is_admin())
);

DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Platform owner reads all roles" ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select_policy ON public.user_roles;
DROP POLICY IF EXISTS user_roles_read_policy ON public.user_roles;
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
      FROM public.profiles AS target_profile
      WHERE target_profile.id = user_roles.user_id
        AND target_profile.tenant_id = (SELECT private.current_tenant_id())
        AND (SELECT private.is_admin())
    )
  )
);

DROP POLICY IF EXISTS "Platform admins visible" ON public.platform_admins;
DROP POLICY IF EXISTS platform_admins_read_policy ON public.platform_admins;
DROP POLICY IF EXISTS platform_admins_select_self_or_platform ON public.platform_admins;

CREATE POLICY platform_admins_select_self_or_platform ON public.platform_admins
FOR SELECT TO authenticated
USING (
  (SELECT private.is_active_user())
  AND (
    user_id = (SELECT auth.uid())
    OR (SELECT private.is_platform_admin())
  )
);

-- Compatibility helpers remain identity-bound. They never accept an arbitrary
-- browser-supplied user id as authority and they derive levels from membership.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS p
      JOIN public.user_roles AS ur ON ur.user_id = p.id
      WHERE p.id = _user_id
        AND p.is_active = true
        AND ur.role = _role
    );
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS p
      JOIN public.user_roles AS ur ON ur.user_id = p.id
      WHERE p.id = _user_id
        AND p.is_active = true
        AND ur.role = ANY(_roles)
    );
$$;

CREATE OR REPLACE FUNCTION public.get_role_level(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.platform_admins AS pa
      WHERE pa.user_id = _user_id
        AND pa.role IN ('platform_owner'::public.platform_role, 'platform_admin'::public.platform_role)
    ) THEN 'L1'
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles AS ur
      WHERE ur.user_id = _user_id
        AND ur.role IN ('super_admin'::public.app_role, 'admin'::public.app_role)
    ) THEN 'L2'
    WHEN EXISTS (
      SELECT 1 FROM public.platform_admins AS pa
      WHERE pa.user_id = _user_id
        AND pa.role = 'platform_support'::public.platform_role
    ) OR EXISTS (
      SELECT 1 FROM public.user_roles AS ur
      WHERE ur.user_id = _user_id
        AND ur.role = 'developer_admin'::public.app_role
    ) THEN 'L3'
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles AS ur WHERE ur.user_id = _user_id
    ) THEN 'L4'
    ELSE NULL
  END
  FROM public.profiles AS p
  WHERE p.id = _user_id
    AND p.is_active = true
    AND _user_id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_platform_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.platform_admins AS pa
      WHERE pa.user_id = _user_id
        AND pa.role = 'platform_owner'::public.platform_role
    );
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.has_any_role(
    _user_id,
    ARRAY['super_admin', 'admin']::public.app_role[]
  );
$$;

CREATE OR REPLACE FUNCTION public.is_developer_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _user_id = (SELECT auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.platform_admins AS pa
        WHERE pa.user_id = _user_id
          AND pa.role IN ('platform_owner'::public.platform_role, 'platform_admin'::public.platform_role)
      )
      OR EXISTS (
        SELECT 1 FROM public.user_roles AS ur
        WHERE ur.user_id = _user_id
          AND ur.role IN (
            'super_admin'::public.app_role,
            'admin'::public.app_role,
            'developer_admin'::public.app_role
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_recruiter(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles AS ur WHERE ur.user_id = _user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.has_any_role(
    _user_id,
    ARRAY['super_admin', 'admin']::public.app_role[]
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_role_level(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_platform_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_company_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_developer_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_recruiter(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
REVOKE ALL ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_role_level(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_platform_owner(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_company_admin(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_developer_admin(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_recruiter(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_role_level(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_owner(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_company_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_developer_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_recruiter(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS role_level;

-- Signup provisions an identity/profile only. Tenant and role assignment are
-- separate administrator-controlled operations.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, tenant_id, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data ->> 'avatar_url',
    NULL,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMIT;
