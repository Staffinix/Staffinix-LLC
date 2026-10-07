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
  target_exists boolean := false;
  actor_is_super_admin boolean;
  actor_is_platform_owner boolean;
  request_matches_role boolean;
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

  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins AS pa
    WHERE pa.user_id = actor_id
      AND pa.role = 'platform_owner'::public.platform_role
  )
  INTO actor_is_platform_owner;

  IF actor_id = _user_id THEN
    RAISE EXCEPTION 'You cannot modify your own authorization state'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.tenant_id, true
  INTO target_tenant_id, target_exists
  FROM public.profiles AS p
  WHERE p.id = _user_id
  FOR UPDATE;

  IF NOT target_exists THEN
    RAISE EXCEPTION 'Target user was not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF target_tenant_id IS NULL THEN
    IF NOT actor_is_platform_owner THEN
      RAISE EXCEPTION 'The target user is outside your tenant'
        USING ERRCODE = '42501';
    END IF;

    UPDATE public.profiles
    SET tenant_id = actor_tenant_id,
        updated_at = now()
    WHERE id = _user_id;
  ELSIF target_tenant_id <> actor_tenant_id THEN
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

  SELECT CASE par.requested_tier
    WHEN 'l2_admin'::public.requestable_access_tier THEN _role = 'admin'::public.app_role
    WHEN 'l3_developer'::public.requestable_access_tier THEN _role = 'developer_admin'::public.app_role
    WHEN 'l4_recruiter'::public.requestable_access_tier THEN _role = 'recruiter'::public.app_role
  END
  INTO request_matches_role
  FROM public.platform_access_requests AS par
  WHERE par.user_id = _user_id
    AND par.status = 'pending'::public.access_request_status
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.platform_access_requests
    SET tenant_id = actor_tenant_id,
        status = CASE
          WHEN request_matches_role THEN 'approved'::public.access_request_status
          ELSE 'rejected'::public.access_request_status
        END,
        reviewed_by = actor_id,
        reviewed_at = now(),
        review_note = CASE
          WHEN request_matches_role THEN 'Provisioned through Company Team role assignment.'
          ELSE 'Superseded by a different Company Team role assignment.'
        END,
        updated_at = now()
    WHERE user_id = _user_id
      AND status = 'pending'::public.access_request_status;
  END IF;
END;
$$;

COMMENT ON FUNCTION private.set_user_role(uuid, public.app_role) IS
  'Assigns one company role. A platform owner who is also a company super admin may atomically onboard an unassigned profile into their own tenant; existing cross-tenant users remain protected.';

COMMIT;
