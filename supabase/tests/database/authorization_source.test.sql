BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(10);

INSERT INTO public.tenants (id, name, slug)
VALUES ('91000000-0000-0000-0000-000000000001', 'Authorization Test', 'authorization-test');

INSERT INTO auth.users (id, email)
VALUES
  ('91000000-0000-0000-0000-000000000010', 'member@example.invalid'),
  ('91000000-0000-0000-0000-000000000020', 'unprovisioned@example.invalid');

UPDATE public.profiles
SET tenant_id = '91000000-0000-0000-0000-000000000001', is_active = true
WHERE id = '91000000-0000-0000-0000-000000000010';

INSERT INTO public.user_roles (user_id, role)
VALUES ('91000000-0000-0000-0000-000000000010', 'recruiter');

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'role_level'
  ),
  'profiles has no browser-editable authorization level'
);

SELECT is(
  (SELECT count(*) FROM public.user_roles WHERE user_id = '91000000-0000-0000-0000-000000000020'),
  0::bigint,
  'signup creates no implicit application role'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = '91000000-0000-0000-0000-000000000020'
      AND is_active = true
  ),
  'signup creates an active application identity profile'
);

SELECT is(
  (SELECT tenant_id FROM public.profiles WHERE id = '91000000-0000-0000-0000-000000000020'),
  NULL::uuid,
  'signup does not assign a tenant implicitly'
);

SELECT ok(
  has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE'),
  'authenticated users may update display fields'
);

SELECT ok(
  NOT has_column_privilege('authenticated', 'public.profiles', 'tenant_id', 'UPDATE'),
  'authenticated users cannot update tenant ownership'
);

SELECT ok(
  NOT has_column_privilege('authenticated', 'public.profiles', 'is_active', 'UPDATE'),
  'authenticated users cannot update account status'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.get_role_level(uuid)', 'EXECUTE'),
  'role helper is not exposed as a browser RPC'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '91000000-0000-0000-0000-000000000010';

SELECT results_eq(
  $$
    UPDATE public.profiles
    SET full_name = 'Updated Member'
    WHERE id = '91000000-0000-0000-0000-000000000010'
    RETURNING full_name
  $$,
  ARRAY['Updated Member'::text],
  'a user can update an allowed field on their own profile'
);

SELECT throws_ok(
  $$
    UPDATE public.profiles
    SET is_active = false
    WHERE id = '91000000-0000-0000-0000-000000000010'
  $$,
  '42501',
  NULL,
  'a user cannot deactivate or reactivate their own account'
);

SELECT * FROM finish();
ROLLBACK;
