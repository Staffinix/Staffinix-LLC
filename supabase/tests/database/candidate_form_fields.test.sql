BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(8);

SELECT has_column('public', 'candidates', 'marketing_types', 'candidate marketing types are persisted');

INSERT INTO public.tenants (id, name, slug) VALUES
  ('41000000-0000-0000-0000-000000000001', 'Candidate Form Tenant A', 'candidate-form-a'),
  ('42000000-0000-0000-0000-000000000002', 'Candidate Form Tenant B', 'candidate-form-b');

INSERT INTO auth.users (id, email) VALUES
  ('4a000000-0000-0000-0000-000000000001', 'candidate-form-a@example.invalid'),
  ('4b000000-0000-0000-0000-000000000002', 'candidate-form-b@example.invalid');

UPDATE public.profiles SET tenant_id = '41000000-0000-0000-0000-000000000001', is_active = true
WHERE id = '4a000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET tenant_id = '42000000-0000-0000-0000-000000000002', is_active = true
WHERE id = '4b000000-0000-0000-0000-000000000002';

INSERT INTO public.user_roles (user_id, role) VALUES
  ('4a000000-0000-0000-0000-000000000001', 'recruiter'),
  ('4b000000-0000-0000-0000-000000000002', 'recruiter');

INSERT INTO public.candidates (
  id, tenant_id, created_by, first_name, last_name, phone, visa_status, marketing_types
) VALUES
  ('4c000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000001', 'Form', 'Candidate', '(317) 555-0188', 'H1B', ARRAY['C2C', 'W2']),
  ('4c000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000001', 'Legacy', 'Candidate', NULL, 'C2C', ARRAY[]::text[]),
  ('4c000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000002', '4b000000-0000-0000-0000-000000000002', 'Other', 'Tenant', NULL, 'H1B', ARRAY[]::text[]);

SELECT is(
  (SELECT phone FROM public.candidates WHERE id = '4c000000-0000-0000-0000-000000000001'),
  '+13175550188',
  'formatted US phone is normalized to E.164 at the database boundary'
);
SELECT is(
  (SELECT marketing_types FROM public.candidates WHERE id = '4c000000-0000-0000-0000-000000000001'),
  ARRAY['C2C', 'W2']::text[],
  'multiple marketing types are stored without flattening'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '4a000000-0000-0000-0000-000000000001';

SELECT results_eq(
  $$UPDATE public.candidates SET marketing_types=ARRAY['Full-Time','1099'] WHERE id='4c000000-0000-0000-0000-000000000001' RETURNING id$$,
  $$VALUES ('4c000000-0000-0000-0000-000000000001'::uuid)$$,
  'editing updates the existing candidate id'
);
SELECT is(
  (SELECT marketing_types FROM public.candidates WHERE id = '4c000000-0000-0000-0000-000000000001'),
  ARRAY['Full-Time', '1099']::text[],
  'edited marketing types persist'
);
SELECT throws_ok(
  $$UPDATE public.candidates SET phone='123' WHERE id='4c000000-0000-0000-0000-000000000001'$$,
  '22023',
  'Enter a valid 10-digit US phone number',
  'invalid phone numbers are rejected server-side'
);
SELECT results_eq(
  $$UPDATE public.candidates SET marketing_types=ARRAY['W2'] WHERE id='4c000000-0000-0000-0000-000000000003' RETURNING id$$,
  $$SELECT NULL::uuid WHERE false$$,
  'cross-tenant candidate edits remain blocked by RLS'
);
SELECT results_eq(
  $$UPDATE public.candidates SET marketing_types=ARRAY['C2C'] WHERE id='4c000000-0000-0000-0000-000000000002' RETURNING visa_status$$,
  $$VALUES ('C2C'::text)$$,
  'editing other fields preserves a legacy C2C visa value'
);
SELECT is(
  (SELECT count(*) FROM public.candidates WHERE id='4c000000-0000-0000-0000-000000000003'),
  0::bigint,
  'tenant A cannot read the tenant B candidate after the blocked edit'
);

SELECT * FROM finish();
ROLLBACK;
