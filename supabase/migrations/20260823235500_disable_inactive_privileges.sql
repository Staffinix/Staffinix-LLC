BEGIN;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active = true
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.platform_admins pa ON pa.user_id = p.id
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active = true
      AND pa.role IN ('platform_owner'::public.platform_role, 'platform_admin'::public.platform_role)
  );
$$;

CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.platform_admins pa ON pa.user_id = p.id
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active = true
      AND pa.role IN ('platform_owner'::public.platform_role, 'platform_admin'::public.platform_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = _user_id
      AND p.is_active = true
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.platform_admins pa ON pa.user_id = p.id
    WHERE p.id = _user_id
      AND p.is_active = true
      AND pa.role IN ('platform_owner'::public.platform_role, 'platform_admin'::public.platform_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.platform_admins pa ON pa.user_id = p.id
    WHERE p.id = _user_id
      AND p.is_active = true
      AND pa.role IN ('platform_owner'::public.platform_role, 'platform_admin'::public.platform_role)
  );
$$;

COMMIT;
