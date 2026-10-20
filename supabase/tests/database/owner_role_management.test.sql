BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(1);
INSERT INTO public.tenants (id, name, slug) VALUES
  ('94000000-0000-0000-0000-000000000001', 'Owner Role Test A', 'owner-role-test-a'),
  ('94000000-0000-0000-0000-000000000002', 'Owner Role Test B', 'owner-role-test-b');
INSERT INTO auth.users (id, email) VALUES
  ('94000000-0000-0000-0000-000000000011', 'owner@owner-role-test.invalid'),
  ('94000000-0000-0000-0000-000000000012', 'platform-admin@owner-role-test.invalid'),
  ('94000000-0000-0000-0000-000000000013', 'recruiter@owner-role-test.invalid'),
  ('94000000-0000-0000-0000-000000000014', 'developer@owner-role-test.invalid'),
  ('94000000-0000-0000-0000-000000000015', 'admin@owner-role-test.invalid'),
  ('94000000-0000-0000-0000-000000000016', 'cross-tenant@owner-role-test.invalid'),
  ('94000000-0000-0000-0000-000000000017', 'inactive@owner-role-test.invalid'),
  ('94000000-0000-0000-0000-000000000018', 'support@owner-role-test.invalid');
UPDATE public.profiles SET
  tenant_id = CASE WHEN id='94000000-0000-0000-0000-000000000016'
    THEN '94000000-0000-0000-0000-000000000002'::uuid
    ELSE '94000000-0000-0000-0000-000000000001'::uuid END,
  is_active = id <> '94000000-0000-0000-0000-000000000017'
WHERE id::text LIKE '94000000-0000-0000-0000-%';
DELETE FROM public.user_roles WHERE user_id::text LIKE '94000000-0000-0000-0000-%';
INSERT INTO public.user_roles (user_id,role) VALUES
  ('94000000-0000-0000-0000-000000000013', 'recruiter'),
  ('94000000-0000-0000-0000-000000000014', 'developer_admin'),
  ('94000000-0000-0000-0000-000000000015', 'admin'),
  ('94000000-0000-0000-0000-000000000016', 'recruiter');
INSERT INTO public.platform_admins (user_id,role) VALUES
  ('94000000-0000-0000-0000-000000000011', 'platform_owner'),
  ('94000000-0000-0000-0000-000000000012', 'platform_admin'),
  ('94000000-0000-0000-0000-000000000017', 'platform_owner'),
  ('94000000-0000-0000-0000-000000000018', 'platform_support');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '94000000-0000-0000-0000-000000000011';
DO $tests$
DECLARE requested text; denied boolean; target uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id='94000000-0000-0000-0000-000000000014' AND role='developer_admin') THEN
    RAISE EXCEPTION 'A pure L1 member cannot read the team role records';
  END IF;
  FOREACH requested IN ARRAY ARRAY['admin','developer_admin','recruiter','super_admin','account_manager','delivery_manager','marketing_executive'] LOOP
    PERFORM public.set_user_access('94000000-0000-0000-0000-000000000013', 'platform_owner');
    IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id='94000000-0000-0000-0000-000000000013' AND role='platform_owner') THEN
      RAISE EXCEPTION 'Owner promotion did not persist';
    END IF;
    PERFORM public.set_user_access('94000000-0000-0000-0000-000000000013', requested);
    IF EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id='94000000-0000-0000-0000-000000000013')
      OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id='94000000-0000-0000-0000-000000000013' AND role::text=requested)
      OR (SELECT count(*) FROM public.user_roles WHERE user_id='94000000-0000-0000-0000-000000000013') <> 1 THEN
      RAISE EXCEPTION 'Owner demotion failed to replace access atomically: %', requested;
    END IF;
  END LOOP;
  -- A pure L1 member must also be supported by the existing compatibility RPC.
  PERFORM public.set_user_role('94000000-0000-0000-0000-000000000014', 'recruiter');
  FOREACH target IN ARRAY ARRAY['94000000-0000-0000-0000-000000000011'::uuid, '94000000-0000-0000-0000-000000000016'::uuid] LOOP
    denied := false;
    BEGIN PERFORM public.set_user_access(target, 'admin');
    EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
    IF NOT denied THEN RAISE EXCEPTION 'Self or cross-tenant access change was accepted'; END IF;
  END LOOP;
  FOREACH requested IN ARRAY ARRAY['not_a_role', NULL::text] LOOP
    denied := false;
    BEGIN PERFORM public.set_user_access('94000000-0000-0000-0000-000000000013', requested);
    EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
    IF NOT denied THEN RAISE EXCEPTION 'Invalid access role was accepted'; END IF;
  END LOOP;
END;
$tests$;

SET LOCAL "request.jwt.claim.sub" = '94000000-0000-0000-0000-000000000012';
DO $tests$
BEGIN
  PERFORM public.set_user_access('94000000-0000-0000-0000-000000000014', 'platform_owner');
END;
$tests$;

SET LOCAL "request.jwt.claim.sub" = '94000000-0000-0000-0000-000000000015';
DO $tests$
DECLARE requested text; denied boolean;
BEGIN
  FOREACH requested IN ARRAY ARRAY['platform_owner', 'developer_admin'] LOOP
    denied := false;
    BEGIN PERFORM public.set_user_access('94000000-0000-0000-0000-000000000013', requested);
    EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
    IF NOT denied THEN RAISE EXCEPTION 'L2 assigned an L1 or L3 role'; END IF;
  END LOOP;
  BEGIN
    PERFORM public.set_user_access('94000000-0000-0000-0000-000000000014', 'recruiter');
    RAISE EXCEPTION 'L2 changed an existing Owner';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$tests$;

SET LOCAL "request.jwt.claim.sub" = '94000000-0000-0000-0000-000000000017';
DO $tests$
BEGIN
  BEGIN
    PERFORM public.set_user_access('94000000-0000-0000-0000-000000000013', 'platform_owner');
    RAISE EXCEPTION 'Inactive Owner assigned access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$tests$;

SET LOCAL "request.jwt.claim.sub" = '94000000-0000-0000-0000-000000000018';
DO $tests$
BEGIN
  BEGIN
    PERFORM public.set_user_access('94000000-0000-0000-0000-000000000013', 'platform_owner');
    RAISE EXCEPTION 'Support member assigned Owner access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$tests$;

RESET ROLE;
SELECT pass('Active L1 grants and removes supported roles atomically; L2, support, inactive, self and cross-tenant attempts are denied');
SELECT * FROM finish();
ROLLBACK;
