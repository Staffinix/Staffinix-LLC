BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(1);

INSERT INTO public.tenants (id, name, slug) VALUES
  ('93000000-0000-0000-0000-000000000001', 'Company Team Test A', 'company-team-test-a'),
  ('93000000-0000-0000-0000-000000000002', 'Company Team Test B', 'company-team-test-b');
INSERT INTO auth.users (id, email) VALUES
  ('93000000-0000-0000-0000-000000000011', 'admin@company-team-test.invalid'),
  ('93000000-0000-0000-0000-000000000012', 'super@company-team-test.invalid'),
  ('93000000-0000-0000-0000-000000000013', 'recruiter@company-team-test.invalid'),
  ('93000000-0000-0000-0000-000000000014', 'developer@company-team-test.invalid'),
  ('93000000-0000-0000-0000-000000000015', 'mixed@company-team-test.invalid'),
  ('93000000-0000-0000-0000-000000000016', 'other-tenant@company-team-test.invalid'),
  ('93000000-0000-0000-0000-000000000017', 'peer-admin@company-team-test.invalid'),
  ('93000000-0000-0000-0000-000000000018', 'inactive@company-team-test.invalid');
UPDATE public.profiles
SET tenant_id = CASE WHEN id = '93000000-0000-0000-0000-000000000016'
    THEN '93000000-0000-0000-0000-000000000002'::uuid
    ELSE '93000000-0000-0000-0000-000000000001'::uuid END,
    is_active = id <> '93000000-0000-0000-0000-000000000018'
WHERE id::text LIKE '93000000-0000-0000-0000-%';
DELETE FROM public.user_roles WHERE user_id::text LIKE '93000000-0000-0000-0000-%';
INSERT INTO public.user_roles (user_id, role) VALUES
  ('93000000-0000-0000-0000-000000000011', 'admin'),
  ('93000000-0000-0000-0000-000000000012', 'super_admin'),
  ('93000000-0000-0000-0000-000000000013', 'recruiter'),
  ('93000000-0000-0000-0000-000000000014', 'developer_admin'),
  ('93000000-0000-0000-0000-000000000015', 'recruiter'),
  ('93000000-0000-0000-0000-000000000015', 'developer_admin'),
  ('93000000-0000-0000-0000-000000000016', 'recruiter'),
  ('93000000-0000-0000-0000-000000000017', 'admin'),
  ('93000000-0000-0000-0000-000000000018', 'admin');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '93000000-0000-0000-0000-000000000011';
DO $tests$
DECLARE
  target uuid;
  requested public.app_role;
  denied boolean;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    '93000000-0000-0000-0000-000000000013'::uuid,
    '93000000-0000-0000-0000-000000000017'::uuid
  ] LOOP
    FOREACH requested IN ARRAY ARRAY['recruiter'::public.app_role, 'admin'::public.app_role] LOOP
      PERFORM public.set_user_role(target, requested);
      IF (SELECT count(*) FROM public.user_roles WHERE user_id = target) <> 1
        OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = target AND role = requested) THEN
        RAISE EXCEPTION 'Admin/Recruiter transition did not persist';
      END IF;
    END LOOP;
  END LOOP;

  FOREACH target IN ARRAY ARRAY[
    '93000000-0000-0000-0000-000000000011'::uuid,
    '93000000-0000-0000-0000-000000000012'::uuid,
    '93000000-0000-0000-0000-000000000014'::uuid,
    '93000000-0000-0000-0000-000000000015'::uuid,
    '93000000-0000-0000-0000-000000000016'::uuid
  ] LOOP
    denied := false;
    BEGIN
      PERFORM public.set_user_role(target, 'recruiter');
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'Protected target was modified: %', target; END IF;
  END LOOP;

  FOREACH requested IN ARRAY ARRAY[
    'super_admin'::public.app_role, 'developer_admin'::public.app_role,
    'account_manager'::public.app_role, 'delivery_manager'::public.app_role,
    'marketing_executive'::public.app_role, NULL::public.app_role
  ] LOOP
    denied := false;
    BEGIN
      PERFORM public.set_user_role('93000000-0000-0000-0000-000000000013', requested);
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'Forbidden role was assigned: %', requested; END IF;
  END LOOP;
END;
$tests$;

SET LOCAL "request.jwt.claim.sub" = '93000000-0000-0000-0000-000000000012';
DO $tests$
BEGIN
  PERFORM public.set_user_role('93000000-0000-0000-0000-000000000013', 'super_admin');
  PERFORM public.set_user_role('93000000-0000-0000-0000-000000000013', 'recruiter');
  BEGIN
    PERFORM public.set_user_role('93000000-0000-0000-0000-000000000014', 'admin');
    RAISE EXCEPTION 'Super Admin overwrote an L3 member';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$tests$;

SET LOCAL "request.jwt.claim.sub" = '93000000-0000-0000-0000-000000000013';
DO $tests$
BEGIN
  BEGIN
    PERFORM public.set_user_role('93000000-0000-0000-0000-000000000017', 'recruiter');
    RAISE EXCEPTION 'Recruiter modified another member';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$tests$;

SET LOCAL "request.jwt.claim.sub" = '93000000-0000-0000-0000-000000000018';
DO $tests$
BEGIN
  BEGIN
    PERFORM public.set_user_role('93000000-0000-0000-0000-000000000017', 'recruiter');
    RAISE EXCEPTION 'Inactive Admin modified another member';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$tests$;

RESET ROLE;
SELECT pass('Company Team RPC allows L2/L4 transitions and denies protected targets, roles, self, tenants and inactive/recruiter actors');
SELECT * FROM finish();
ROLLBACK;
