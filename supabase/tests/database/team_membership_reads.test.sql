BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(1);
INSERT INTO public.tenants (id,name,slug) VALUES
  ('95000000-0000-0000-0000-000000000001','Team Read Test A','team-read-test-a'),
  ('95000000-0000-0000-0000-000000000002','Team Read Test B','team-read-test-b');
INSERT INTO auth.users (id,email) VALUES
  ('95000000-0000-0000-0000-000000000011','owner@team-read-test.invalid'),
  ('95000000-0000-0000-0000-000000000012','other-owner@team-read-test.invalid'),
  ('95000000-0000-0000-0000-000000000013','admin@team-read-test.invalid'),
  ('95000000-0000-0000-0000-000000000014','recruiter@team-read-test.invalid'),
  ('95000000-0000-0000-0000-000000000015','inactive@team-read-test.invalid'),
  ('95000000-0000-0000-0000-000000000016','support@team-read-test.invalid');
UPDATE public.profiles SET
  tenant_id=CASE WHEN id='95000000-0000-0000-0000-000000000012'
    THEN '95000000-0000-0000-0000-000000000002'::uuid
    ELSE '95000000-0000-0000-0000-000000000001'::uuid END,
  is_active=id <> '95000000-0000-0000-0000-000000000015'
WHERE id::text LIKE '95000000-0000-0000-0000-%';
DELETE FROM public.user_roles WHERE user_id::text LIKE '95000000-0000-0000-0000-%';
INSERT INTO public.user_roles (user_id,role) VALUES
  ('95000000-0000-0000-0000-000000000013','admin'),
  ('95000000-0000-0000-0000-000000000014','recruiter'),
  ('95000000-0000-0000-0000-000000000015','admin');
INSERT INTO public.platform_admins (user_id,role) VALUES
  ('95000000-0000-0000-0000-000000000011','platform_owner'),
  ('95000000-0000-0000-0000-000000000012','platform_owner'),
  ('95000000-0000-0000-0000-000000000016','platform_support');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '95000000-0000-0000-0000-000000000013';
DO $tests$
DECLARE denied boolean := false;
BEGIN
  IF (SELECT count(*) FROM public.platform_admins WHERE user_id::text LIKE '95000000-0000-0000-0000-%') <> 2 THEN
    RAISE EXCEPTION 'L2 cannot identify all same-tenant platform memberships';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id='95000000-0000-0000-0000-000000000012') THEN
    RAISE EXCEPTION 'L2 read a cross-tenant membership';
  END IF;
  BEGIN
    INSERT INTO public.platform_admins (user_id,role) VALUES ('95000000-0000-0000-0000-000000000014','platform_owner');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Membership read access permitted an Owner insertion'; END IF;
  BEGIN
    UPDATE public.platform_admins SET role='platform_owner' WHERE user_id='95000000-0000-0000-0000-000000000016';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id='95000000-0000-0000-0000-000000000016' AND role='platform_support') THEN
    RAISE EXCEPTION 'Membership read access permitted an update';
  END IF;
  BEGIN
    DELETE FROM public.platform_admins WHERE user_id='95000000-0000-0000-0000-000000000011';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id='95000000-0000-0000-0000-000000000011') THEN
    RAISE EXCEPTION 'Membership read access permitted deletion';
  END IF;
END;
$tests$;

SET LOCAL "request.jwt.claim.sub" = '95000000-0000-0000-0000-000000000014';
DO $tests$
BEGIN
  IF EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id::text LIKE '95000000-0000-0000-0000-%') THEN
    RAISE EXCEPTION 'A recruiter read another member platform role';
  END IF;
END;
$tests$;

SET LOCAL "request.jwt.claim.sub" = '95000000-0000-0000-0000-000000000015';
DO $tests$
BEGIN
  IF EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id::text LIKE '95000000-0000-0000-0000-%') THEN
    RAISE EXCEPTION 'An inactive administrator read platform memberships';
  END IF;
END;
$tests$;

SET LOCAL "request.jwt.claim.sub" = '95000000-0000-0000-0000-000000000011';
DO $tests$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id='95000000-0000-0000-0000-000000000011') THEN
    RAISE EXCEPTION 'Pure L1 test unexpectedly has an application role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id='95000000-0000-0000-0000-000000000011' AND role='platform_owner') THEN
    RAISE EXCEPTION 'A pure L1 account cannot read its Owner identity';
  END IF;
END;
$tests$;
RESET ROLE;
SELECT pass('Authenticated team membership reads need no secret; tenant isolation, active checks and write denial hold');
SELECT * FROM finish();
ROLLBACK;
