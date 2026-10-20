BEGIN;

CREATE OR REPLACE FUNCTION private.set_user_access(_user_id uuid, _role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_tenant uuid;
  target_tenant uuid;
  target_exists boolean;
  actor_is_owner boolean;
  actor_is_root_owner boolean;
  actor_is_super boolean;
  target_platform public.platform_role;
  request_matches boolean;
BEGIN
  PERFORM p.id FROM public.profiles p WHERE p.id IN (actor_id, _user_id)
  ORDER BY p.id FOR UPDATE;
  SELECT p.tenant_id INTO actor_tenant FROM public.profiles p
  WHERE p.id = actor_id AND p.is_active = true;
  IF actor_tenant IS NULL THEN
    RAISE EXCEPTION 'Administrator account is inactive or has no tenant' USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id=actor_id
    AND pa.role IN ('platform_owner', 'platform_admin')) INTO actor_is_owner;
  SELECT EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id=actor_id
    AND pa.role='platform_owner') INTO actor_is_root_owner;
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=actor_id
    AND ur.role='super_admin') INTO actor_is_super;
  IF NOT actor_is_owner AND NOT actor_is_super AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id=actor_id AND ur.role='admin'
  ) THEN
    RAISE EXCEPTION 'Administrator privileges required' USING ERRCODE = '42501';
  END IF;
  IF actor_id = _user_id THEN
    RAISE EXCEPTION 'You cannot modify your own authorization state' USING ERRCODE = '42501';
  END IF;
  SELECT p.tenant_id, true INTO target_tenant, target_exists FROM public.profiles p WHERE p.id=_user_id;
  IF NOT coalesce(target_exists, false) THEN
    RAISE EXCEPTION 'Target user was not found' USING ERRCODE = 'P0002';
  END IF;
  IF (target_tenant IS NULL AND NOT actor_is_root_owner)
    OR (target_tenant IS NOT NULL AND target_tenant <> actor_tenant) THEN
    RAISE EXCEPTION 'The target user is outside your tenant' USING ERRCODE = '42501';
  END IF;
  IF _role IS NULL OR _role NOT IN (
    'platform_owner', 'super_admin', 'admin', 'developer_admin', 'recruiter',
    'account_manager', 'delivery_manager', 'marketing_executive'
  ) THEN
    RAISE EXCEPTION 'Unsupported access role' USING ERRCODE = '42501';
  END IF;
  SELECT pa.role INTO target_platform FROM public.platform_admins pa WHERE pa.user_id=_user_id;
  IF NOT actor_is_owner THEN
    IF _role NOT IN ('super_admin', 'admin', 'recruiter') THEN
      RAISE EXCEPTION 'Company Team can assign only L2 and L4 roles' USING ERRCODE = '42501';
    END IF;
    IF target_platform IS NOT NULL THEN
      RAISE EXCEPTION 'Only L1 - Owner can modify platform members' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=_user_id
      AND ur.role NOT IN ('super_admin','admin','recruiter'))
      OR NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=_user_id) THEN
      RAISE EXCEPTION 'Company Team can manage only L2 and L4 members' USING ERRCODE = '42501';
    END IF;
    IF NOT actor_is_super AND (_role='super_admin' OR EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id=_user_id AND ur.role='super_admin'
    )) THEN
      RAISE EXCEPTION 'Only super administrators can assign or modify Super Admin roles' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF target_tenant IS NULL THEN
    UPDATE public.profiles SET tenant_id=actor_tenant, updated_at=now() WHERE id=_user_id;
  END IF;
  IF _role='platform_owner' THEN
    INSERT INTO public.platform_admins (user_id, role) VALUES (_user_id, 'platform_owner')
    ON CONFLICT (user_id) DO UPDATE SET role=EXCLUDED.role;
  ELSE
    -- Removing platform membership is required for an L1 demotion to take effect.
    IF actor_is_owner THEN DELETE FROM public.platform_admins WHERE user_id=_user_id; END IF;
    DELETE FROM public.user_roles WHERE user_id=_user_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role::public.app_role);
  END IF;

  SELECT CASE par.requested_tier
    WHEN 'l2_admin'::public.requestable_access_tier THEN _role='admin'
    WHEN 'l3_developer'::public.requestable_access_tier THEN _role='developer_admin'
    WHEN 'l4_recruiter'::public.requestable_access_tier THEN _role='recruiter'
  END INTO request_matches FROM public.platform_access_requests par
  WHERE par.user_id=_user_id AND par.status='pending'::public.access_request_status FOR UPDATE;
  IF FOUND THEN
    UPDATE public.platform_access_requests
    SET tenant_id=actor_tenant,
      status=CASE WHEN request_matches THEN 'approved'::public.access_request_status ELSE 'denied'::public.access_request_status END,
      reviewed_by=actor_id, reviewed_at=now(),
      review_note=CASE WHEN request_matches THEN 'Provisioned through Company Team role assignment.' ELSE 'Superseded by a different Company Team role assignment.' END,
      updated_at=now()
    WHERE user_id=_user_id AND status='pending'::public.access_request_status;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_access(_user_id uuid, _role text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.set_user_access(_user_id, _role);
$$;

CREATE OR REPLACE FUNCTION private.set_user_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.set_user_access(_user_id, _role::text);
$$;

REVOKE ALL ON FUNCTION private.set_user_access(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_user_access(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.set_user_access(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_access(uuid,text) TO authenticated;
COMMENT ON FUNCTION private.set_user_access(uuid,text) IS
  'Atomic L1-L4 assignment. Active L1 members manage any supported role in their tenant; L2 retains L2/L4-only limits. Self-changes and existing cross-tenant changes are forbidden.';
COMMIT;
