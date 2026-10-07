BEGIN;

-- Provision the explicitly approved launch accounts. Authentication remains
-- in Supabase Auth; this migration stores only server-owned tenant membership
-- and authorization. Passwords must never be stored in migrations or frontend
-- code.
DO $provision$
DECLARE
  company_tenant_id uuid;
BEGIN
  SELECT tenants.id
  INTO company_tenant_id
  FROM public.tenants
  WHERE tenants.slug = 'staffinix-demo'
  LIMIT 1;

  -- Fresh local/CI databases may not contain the environment-specific tenant
  -- or Auth users. In that case this data migration is intentionally a no-op.
  IF company_tenant_id IS NULL THEN
    RAISE NOTICE 'Skipping launch-account provisioning: tenant staffinix-demo does not exist';
    RETURN;
  END IF;

  UPDATE public.profiles AS profiles
  SET tenant_id = company_tenant_id,
      is_active = true
  FROM auth.users AS users
  WHERE profiles.id = users.id
    AND lower(users.email) IN (
      'manideep.staffinix@gmail.com',
      'manideep@gmail.com',
      'manistaff@gmail.com',
      'manideepstaff@gmail.com'
    );

  -- Converge these launch accounts to the exact approved application roles.
  DELETE FROM public.user_roles AS roles
  USING auth.users AS users
  WHERE roles.user_id = users.id
    AND lower(users.email) IN (
      'manideep.staffinix@gmail.com',
      'manideep@gmail.com',
      'manistaff@gmail.com',
      'manideepstaff@gmail.com'
    );

  INSERT INTO public.user_roles (user_id, role)
  SELECT users.id, assignments.role
  FROM (
    VALUES
      ('manideep.staffinix@gmail.com', 'super_admin'::public.app_role),
      ('manideep@gmail.com', 'super_admin'::public.app_role),
      ('manistaff@gmail.com', 'developer_admin'::public.app_role),
      ('manideepstaff@gmail.com', 'recruiter'::public.app_role)
  ) AS assignments(email, role)
  JOIN auth.users AS users ON lower(users.email) = assignments.email
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Only the L1 account is a platform owner. L2-L4 remain tenant-scoped even
  -- if a stale platform membership was added previously.
  DELETE FROM public.platform_admins AS memberships
  USING auth.users AS users
  WHERE memberships.user_id = users.id
    AND lower(users.email) IN (
      'manideep@gmail.com',
      'manistaff@gmail.com',
      'manideepstaff@gmail.com'
    );

  INSERT INTO public.platform_admins (user_id, role)
  SELECT users.id, 'platform_owner'::public.platform_role
  FROM auth.users AS users
  WHERE lower(users.email) = 'manideep.staffinix@gmail.com'
  ON CONFLICT (user_id) DO UPDATE
  SET role = EXCLUDED.role;
END;
$provision$;

COMMIT;
