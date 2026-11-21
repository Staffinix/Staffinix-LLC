BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(9);

INSERT INTO public.tenants (id, name, slug) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'Domain Tenant', 'domain-tenant');

INSERT INTO auth.users (id, email) VALUES
  ('d2000000-0000-4000-8000-000000000001', 'domain-recruiter@example.invalid');

UPDATE public.profiles
SET tenant_id = 'd1000000-0000-4000-8000-000000000001', is_active = true
WHERE id = 'd2000000-0000-4000-8000-000000000001';

INSERT INTO public.user_roles (user_id, role) VALUES
  ('d2000000-0000-4000-8000-000000000001', 'recruiter');

SET LOCAL "request.jwt.claim.sub" = 'd2000000-0000-4000-8000-000000000001';
INSERT INTO public.candidates (id, tenant_id, created_by, first_name, last_name) VALUES
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
   'd2000000-0000-4000-8000-000000000001', 'Domain', 'Candidate');

INSERT INTO public.requirements (id, tenant_id, created_by, title) VALUES
  ('d4000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
   'd2000000-0000-4000-8000-000000000001', 'Python Data Engineer');

-- The verification trigger only allows a reviewer flow; seed the end state directly.
ALTER TABLE public.resumes DISABLE TRIGGER resumes_verification_metadata;
INSERT INTO public.resumes (
  id, candidate_id, tenant_id, file_path, file_name, uploaded_by,
  verification_status, verified_by, verified_at, verified_facts_hash
)
SELECT v.id::uuid, 'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001', 'inline://d3000000-0000-4000-8000-000000000001', v.file,
  'd2000000-0000-4000-8000-000000000001', v.status,
  CASE WHEN v.status = 'verified' THEN 'd2000000-0000-4000-8000-000000000001'::uuid END,
  CASE WHEN v.status = 'verified' THEN now() END,
  CASE WHEN v.status = 'verified' THEN 'facts-hash' END
FROM (VALUES
  ('d5000000-0000-4000-8000-000000000001', 'verified.pdf', 'verified'),
  ('d5000000-0000-4000-8000-000000000002', 'pending.pdf', 'pending')
) AS v(id, file, status);
ALTER TABLE public.resumes ENABLE TRIGGER resumes_verification_metadata;

SELECT has_column('public', 'resume_versions', 'target_technology', 'versions can record a technology');
SELECT has_column('public', 'resume_versions', 'target_domain', 'versions can record a domain');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = 'd2000000-0000-4000-8000-000000000001';

SELECT lives_ok(
  $$INSERT INTO public.resume_versions (
      id, candidate_id, source_resume_id, target_technology, target_domain,
      source_hash, claim_validation, created_by
    ) VALUES (
      'd6000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
      'd5000000-0000-4000-8000-000000000001', 'Python', 'Data Engineer',
      'hash', '{"valid": true}', 'd2000000-0000-4000-8000-000000000001'
    )$$,
  'a verified resume can be tailored for a domain without a requirement'
);
SELECT throws_ok(
  $$INSERT INTO public.resume_versions (
      candidate_id, source_resume_id, target_technology, target_domain,
      claim_validation, created_by
    ) VALUES (
      'd3000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
      'Python', 'Data Engineer', '{"valid": true}', 'd2000000-0000-4000-8000-000000000001'
    )$$,
  NULL, 'Resume version is missing verified source evidence',
  'a domain version needs a source hash'
);
SELECT throws_ok(
  $$INSERT INTO public.resume_versions (
      candidate_id, source_resume_id, target_technology, source_hash, claim_validation, created_by
    ) VALUES (
      'd3000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
      'Python', 'hash', '{"valid": true}', 'd2000000-0000-4000-8000-000000000001'
    )$$,
  '23514', NULL,
  'technology and domain must be set together'
);
SELECT throws_ok(
  $$INSERT INTO public.resume_versions (
      candidate_id, requirement_id, source_resume_id, target_technology, target_domain,
      source_hash, claim_validation, created_by
    ) VALUES (
      'd3000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
      'd5000000-0000-4000-8000-000000000001', 'Python', 'Data Engineer',
      'hash', '{"valid": true}', 'd2000000-0000-4000-8000-000000000001'
    )$$,
  '23514', NULL,
  'a version cannot target a requirement and a domain together'
);
SELECT throws_ok(
  $$INSERT INTO public.resume_versions (
      candidate_id, source_resume_id, target_technology, target_domain,
      source_hash, claim_validation, created_by
    ) VALUES (
      'd3000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002',
      'Python', 'Data Engineer', 'hash', '{"valid": true}',
      'd2000000-0000-4000-8000-000000000001'
    )$$,
  '42501', NULL,
  'an unverified resume cannot be tailored for a domain'
);
SELECT throws_ok(
  $$UPDATE public.resume_versions SET target_domain = 'Data Scientist'
    WHERE id = 'd6000000-0000-4000-8000-000000000001'$$,
  NULL, 'Tailored resume evidence is immutable; create a new version instead',
  'the target cannot be changed after creation'
);
SELECT lives_ok(
  $$UPDATE public.resume_versions SET status = 'approved'
    WHERE id = 'd6000000-0000-4000-8000-000000000001'$$,
  'a reviewer can approve a domain version'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
