BEGIN;

-- Reconcile the four explicitly approved acceptance-test identities. This is
-- intentionally keyed by Auth email because the UUIDs differ by environment.
DO $restore_roles$
DECLARE
  company_tenant_id uuid;
BEGIN
  SELECT t.id
  INTO company_tenant_id
  FROM public.tenants AS t
  WHERE t.slug = 'staffinix-demo'
  LIMIT 1;

  IF company_tenant_id IS NULL THEN
    RAISE NOTICE 'Skipping launch-account role reconciliation: staffinix-demo tenant is absent';
    RETURN;
  END IF;

  UPDATE public.profiles AS p
  SET tenant_id = company_tenant_id,
      is_active = true
  FROM auth.users AS u
  WHERE p.id = u.id
    AND lower(u.email) IN (
      'manideep.staffinix@gmail.com',
      'manideep@gmail.com',
      'manistaff@gmail.com',
      'manideepstaff@gmail.com'
    );

  DELETE FROM public.user_roles AS ur
  USING auth.users AS u
  WHERE ur.user_id = u.id
    AND lower(u.email) IN (
      'manideep.staffinix@gmail.com',
      'manideep@gmail.com',
      'manistaff@gmail.com',
      'manideepstaff@gmail.com'
    );

  INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, expected.role
  FROM (
    VALUES
      ('manideep.staffinix@gmail.com', 'super_admin'::public.app_role),
      ('manideep@gmail.com', 'super_admin'::public.app_role),
      ('manistaff@gmail.com', 'developer_admin'::public.app_role),
      ('manideepstaff@gmail.com', 'recruiter'::public.app_role)
  ) AS expected(email, role)
  JOIN auth.users AS u ON lower(u.email) = expected.email;

  DELETE FROM public.platform_admins AS pa
  USING auth.users AS u
  WHERE pa.user_id = u.id
    AND lower(u.email) IN (
      'manideep@gmail.com',
      'manistaff@gmail.com',
      'manideepstaff@gmail.com'
    );

  INSERT INTO public.platform_admins (user_id, role)
  SELECT u.id, 'platform_owner'::public.platform_role
  FROM auth.users AS u
  WHERE lower(u.email) = 'manideep.staffinix@gmail.com'
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
END;
$restore_roles$;

COMMIT;
