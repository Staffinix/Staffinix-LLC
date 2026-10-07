BEGIN;

CREATE OR REPLACE FUNCTION private.set_user_role(
  _user_id uuid,
  _role public.app_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_tenant_id uuid;
  target_tenant_id uuid;
  actor_is_super_admin boolean;
BEGIN
  SELECT p.tenant_id
  INTO actor_tenant_id
  FROM public.profiles AS p
  WHERE p.id = actor_id
    AND p.is_active = true;

  IF actor_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Administrator account is inactive or has no tenant'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = actor_id
      AND ur.role = 'super_admin'::public.app_role
  )
  INTO actor_is_super_admin;

  IF NOT actor_is_super_admin AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = actor_id
      AND ur.role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Administrator privileges required'
      USING ERRCODE = '42501';
  END IF;

  IF actor_id = _user_id THEN
    RAISE EXCEPTION 'You cannot modify your own authorization state'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.tenant_id
  INTO target_tenant_id
  FROM public.profiles AS p
  WHERE p.id = _user_id;

  IF target_tenant_id IS NULL OR target_tenant_id <> actor_tenant_id THEN
    RAISE EXCEPTION 'The target user is outside your tenant'
      USING ERRCODE = '42501';
  END IF;

  IF _role IN (
    'admin'::public.app_role,
    'super_admin'::public.app_role,
    'developer_admin'::public.app_role
  ) AND NOT actor_is_super_admin THEN
    RAISE EXCEPTION 'Only super administrators can assign privileged administrator roles'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role);
END;
$$;

COMMIT;
