BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(10);

INSERT INTO public.tenants (id, name, slug) VALUES
  ('92000000-0000-0000-0000-000000000001', 'Role Test Tenant A', 'role-test-tenant-a'),
  ('92000000-0000-0000-0000-000000000002', 'Role Test Tenant B', 'role-test-tenant-b');

INSERT INTO auth.users (id, email) VALUES
  ('92000000-0000-0000-0000-000000000011', 'owner@role-test.invalid'),
  ('92000000-0000-0000-0000-000000000012', 'admin@role-test.invalid'),
  ('92000000-0000-0000-0000-000000000013', 'unassigned@role-test.invalid'),
  ('92000000-0000-0000-0000-000000000014', 'unassigned-two@role-test.invalid'),
  ('92000000-0000-0000-0000-000000000015', 'other-tenant@role-test.invalid');

UPDATE public.profiles
SET tenant_id = CASE
      WHEN id = '92000000-0000-0000-0000-000000000015' THEN '92000000-0000-0000-0000-000000000002'::uuid
      WHEN id IN (
        '92000000-0000-0000-0000-000000000011',
        '92000000-0000-0000-0000-000000000012'
      ) THEN '92000000-0000-0000-0000-000000000001'::uuid
      ELSE NULL
    END,
    is_active = true
WHERE id::text LIKE '92000000-0000-0000-0000-%';

DELETE FROM public.user_roles
WHERE user_id IN (
  '92000000-0000-0000-0000-000000000011',
  '92000000-0000-0000-0000-000000000012',
  '92000000-0000-0000-0000-000000000013',
  '92000000-0000-0000-0000-000000000014',
  '92000000-0000-0000-0000-000000000015'
);

INSERT INTO public.user_roles (user_id, role) VALUES
  ('92000000-0000-0000-0000-000000000011', 'super_admin'),
  ('92000000-0000-0000-0000-000000000012', 'admin'),
  ('92000000-0000-0000-0000-000000000015', 'recruiter');

INSERT INTO public.platform_admins (user_id, role)
VALUES ('92000000-0000-0000-0000-000000000011', 'platform_owner');

INSERT INTO public.platform_access_requests (
  user_id, user_email, requested_tier, reason
) VALUES (
  '92000000-0000-0000-0000-000000000013',
  'unassigned@role-test.invalid',
  'l4_recruiter',
  'Recruiter access is required'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '92000000-0000-0000-0000-000000000011';

SELECT lives_ok(
  $$SELECT public.set_user_role(
      '92000000-0000-0000-0000-000000000013', 'recruiter'
    )$$,
  'platform owner super admin can onboard an unassigned profile'
);

RESET ROLE;

SELECT results_eq(
  $$SELECT tenant_id FROM public.profiles
    WHERE id='92000000-0000-0000-0000-000000000013'$$,
  ARRAY['92000000-0000-0000-0000-000000000001'::uuid],
  'onboarding attaches the profile to the actor tenant'
);

SELECT results_eq(
  $$SELECT role::text FROM public.user_roles
    WHERE user_id='92000000-0000-0000-0000-000000000013'$$,
  ARRAY['recruiter'::text],
  'onboarding assigns exactly the selected role'
);

SELECT results_eq(
  $$SELECT status::text FROM public.platform_access_requests
    WHERE user_id='92000000-0000-0000-0000-000000000013'$$,
  ARRAY['approved'::text],
  'a matching pending request is resolved as approved'
);

SELECT results_eq(
  $$SELECT reviewed_by FROM public.platform_access_requests
    WHERE user_id='92000000-0000-0000-0000-000000000013'$$,
  ARRAY['92000000-0000-0000-0000-000000000011'::uuid],
  'the provisioning action records its reviewer'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '92000000-0000-0000-0000-000000000012';

SELECT throws_ok(
  $$SELECT public.set_user_role(
      '92000000-0000-0000-0000-000000000014', 'recruiter'
    )$$,
  '42501',
  'The target user is outside your tenant',
  'a company admin cannot claim an unassigned profile'
);

RESET ROLE;

SELECT is(
  (SELECT tenant_id FROM public.profiles
   WHERE id='92000000-0000-0000-0000-000000000014'),
  NULL::uuid,
  'a rejected claim leaves the profile unassigned'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '92000000-0000-0000-0000-000000000011';

SELECT throws_ok(
  $$SELECT public.set_user_role(
      '92000000-0000-0000-0000-000000000015', 'admin'
    )$$,
  '42501',
  'The target user is outside your tenant',
  'a platform owner cannot modify an existing user in another tenant'
);

RESET ROLE;

SELECT results_eq(
  $$SELECT role::text FROM public.user_roles
    WHERE user_id='92000000-0000-0000-0000-000000000015'$$,
  ARRAY['recruiter'::text],
  'the cross-tenant user role remains unchanged'
);

SELECT is(
  (SELECT count(*) FROM public.user_roles
   WHERE user_id='92000000-0000-0000-0000-000000000013'),
  1::bigint,
  'role replacement leaves one effective application role'
);

SELECT * FROM finish();
ROLLBACK;
