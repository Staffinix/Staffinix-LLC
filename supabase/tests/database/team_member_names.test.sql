BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(6);

INSERT INTO public.tenants (id, name, slug) VALUES
  ('da000000-0000-0000-0000-000000000001', 'Names Tenant A', 'names-tenant-a'),
  ('db000000-0000-0000-0000-000000000002', 'Names Tenant B', 'names-tenant-b');

INSERT INTO auth.users (id, email) VALUES
  ('da100000-0000-0000-0000-000000000001', 'names-a1@example.invalid'),
  ('da200000-0000-0000-0000-000000000002', 'names-a2@example.invalid'),
  ('da300000-0000-0000-0000-000000000003', 'names-a3@example.invalid'),
  ('db100000-0000-0000-0000-000000000001', 'names-b1@example.invalid');

UPDATE public.profiles SET tenant_id = 'da000000-0000-0000-0000-000000000001', is_active = true,
  full_name = 'Asha Rao' WHERE id = 'da100000-0000-0000-0000-000000000001';
UPDATE public.profiles SET tenant_id = 'da000000-0000-0000-0000-000000000001', is_active = true,
  full_name = 'Ben Cole' WHERE id = 'da200000-0000-0000-0000-000000000002';
UPDATE public.profiles SET tenant_id = 'da000000-0000-0000-0000-000000000001', is_active = false,
  full_name = 'Inactive Person' WHERE id = 'da300000-0000-0000-0000-000000000003';
UPDATE public.profiles SET tenant_id = 'db000000-0000-0000-0000-000000000002', is_active = true,
  full_name = 'Other Company' WHERE id = 'db100000-0000-0000-0000-000000000001';

INSERT INTO public.user_roles (user_id, role) VALUES
  ('da100000-0000-0000-0000-000000000001', 'recruiter'),
  ('da200000-0000-0000-0000-000000000002', 'recruiter'),
  ('db100000-0000-0000-0000-000000000001', 'recruiter');

SELECT ok(
  NOT has_function_privilege('anon', 'public.get_team_member_names(uuid[])', 'EXECUTE'),
  'anonymous callers cannot look up names'
);
SELECT is(
  pg_get_function_result('public.get_team_member_names(uuid[])'::regprocedure),
  'TABLE(id uuid, full_name text)',
  'the lookup returns only an id and a name'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = 'da100000-0000-0000-0000-000000000001';

SELECT results_eq(
  'SELECT count(*) FROM public.profiles WHERE id = ''da200000-0000-0000-0000-000000000002''',
  ARRAY[0::bigint],
  'an L4 still cannot read a colleague profile directly'
);
SELECT results_eq(
  $$SELECT full_name FROM public.get_team_member_names(
    ARRAY['da200000-0000-0000-0000-000000000002'::uuid]
  )$$,
  ARRAY['Ben Cole'],
  'an L4 can see a colleague name'
);
SELECT results_eq(
  $$SELECT count(*) FROM public.get_team_member_names(
    ARRAY['db100000-0000-0000-0000-000000000001'::uuid]
  )$$,
  ARRAY[0::bigint],
  'names from another company are not returned'
);

SET LOCAL "request.jwt.claim.sub" = 'da300000-0000-0000-0000-000000000003';
SELECT results_eq(
  $$SELECT count(*) FROM public.get_team_member_names(
    ARRAY['da100000-0000-0000-0000-000000000001'::uuid]
  )$$,
  ARRAY[0::bigint],
  'an inactive account cannot look up names'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
