BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(21);

SELECT has_function(
  'public',
  'create_candidate_graph',
  ARRAY['jsonb', 'jsonb', 'jsonb', 'jsonb', 'jsonb', 'jsonb', 'jsonb'],
  'candidate graph transaction RPC exists'
);

SELECT ok(
  NOT (
    SELECT prosecdef
    FROM pg_proc
    WHERE oid = 'public.create_candidate_graph(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ),
  'candidate graph RPC is security invoker so RLS remains authoritative'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.create_candidate_graph(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated users can create a candidate graph'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_candidate_graph(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'anonymous users cannot create a candidate graph'
);

INSERT INTO public.tenants (id, name, slug) VALUES
  ('31000000-0000-0000-0000-000000000001', 'Candidate Tx Tenant A', 'candidate-tx-a'),
  ('32000000-0000-0000-0000-000000000002', 'Candidate Tx Tenant B', 'candidate-tx-b');

INSERT INTO auth.users (id, email) VALUES
  ('3a000000-0000-0000-0000-000000000001', 'candidate-tx@example.invalid');

UPDATE public.profiles
SET tenant_id = '31000000-0000-0000-0000-000000000001', is_active = true
WHERE id = '3a000000-0000-0000-0000-000000000001';

INSERT INTO public.user_roles (user_id, role) VALUES
  ('3a000000-0000-0000-0000-000000000001', 'recruiter');

CREATE TEMP TABLE created_candidate_ids (id uuid PRIMARY KEY);
GRANT SELECT, INSERT ON created_candidate_ids TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '3a000000-0000-0000-0000-000000000001';

INSERT INTO created_candidate_ids (id)
SELECT candidate_id
FROM public.create_candidate_graph(
  '{
    "first_name": "Atomic",
    "last_name": "Candidate",
    "email": "atomic@example.invalid",
    "phone": "(317) 555-0188",
    "marketing_types": ["C2C", "W2"],
    "status": "active",
    "source": "pdf",
    "tenant_id": "32000000-0000-0000-0000-000000000002",
    "created_by": "00000000-0000-0000-0000-000000000000"
  }'::jsonb,
  '[
    {"skill":"PostgreSQL","years":5,"is_primary":true},
    {"skill":"TypeScript","years":4,"is_primary":false}
  ]'::jsonb,
  '[{"company":"Verified Employer","title":"Engineer","is_current":true}]'::jsonb,
  '[{"institution":"Verified University","degree":"BS","end_year":2020}]'::jsonb,
  '[{"name":"Verified Project","technologies":["PostgreSQL"]}]'::jsonb,
  '[{"name":"Verified Certification","issuer":"Verified Issuer"}]'::jsonb,
  '{
    "file_name":"verified.pdf",
    "mime_type":"application/pdf",
    "is_primary":true,
    "extracted_text":"Verified candidate facts only",
    "source":"pdf"
  }'::jsonb
);

SELECT is((SELECT count(*) FROM created_candidate_ids), 1::bigint, 'RPC returns one candidate id');
SELECT is(
  (SELECT count(*) FROM public.candidates WHERE id = (SELECT id FROM created_candidate_ids)),
  1::bigint,
  'candidate row is committed'
);
SELECT ok(
  (
    SELECT tenant_id = '31000000-0000-0000-0000-000000000001'
       AND created_by = '3a000000-0000-0000-0000-000000000001'
    FROM public.candidates
    WHERE id = (SELECT id FROM created_candidate_ids)
  ),
  'tenant and actor are derived from the authenticated profile, not JSON input'
);
SELECT is(
  (SELECT phone FROM public.candidates WHERE id = (SELECT id FROM created_candidate_ids)),
  '+13175550188',
  'candidate graph creation normalizes the US phone number'
);
SELECT is(
  (SELECT marketing_types FROM public.candidates WHERE id = (SELECT id FROM created_candidate_ids)),
  ARRAY['C2C', 'W2']::text[],
  'candidate graph creation persists multiple marketing types'
);
SELECT is(
  (SELECT count(*) FROM public.candidate_skills WHERE candidate_id = (SELECT id FROM created_candidate_ids)),
  2::bigint,
  'skills are written in the graph transaction'
);
SELECT is(
  (SELECT count(*) FROM public.candidate_employment WHERE candidate_id = (SELECT id FROM created_candidate_ids)),
  1::bigint,
  'employment is written in the graph transaction'
);
SELECT is(
  (SELECT count(*) FROM public.candidate_education WHERE candidate_id = (SELECT id FROM created_candidate_ids)),
  1::bigint,
  'education is written in the graph transaction'
);
SELECT is(
  (SELECT count(*) FROM public.candidate_projects WHERE candidate_id = (SELECT id FROM created_candidate_ids)),
  1::bigint,
  'projects are written in the graph transaction'
);
SELECT is(
  (SELECT count(*) FROM public.candidate_certifications WHERE candidate_id = (SELECT id FROM created_candidate_ids)),
  1::bigint,
  'certifications are written in the graph transaction'
);
SELECT is(
  (SELECT count(*) FROM public.resumes WHERE candidate_id = (SELECT id FROM created_candidate_ids)),
  1::bigint,
  'resume metadata is written in the graph transaction'
);

SELECT throws_ok(
  $$
    SELECT * FROM public.create_candidate_graph(
      '{"first_name":"Must","last_name":"Rollback"}'::jsonb,
      '[{"skill":"Duplicate"},{"skill":"Duplicate"}]'::jsonb
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "candidate_skills_unique"',
  'a child constraint failure aborts the candidate graph'
);

SELECT is(
  (SELECT count(*) FROM public.candidates WHERE first_name = 'Must' AND last_name = 'Rollback'),
  0::bigint,
  'failed child insert rolls back the parent candidate'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM private.candidate_embedding_jobs
    WHERE candidate_id = (SELECT id FROM created_candidate_ids)
  ),
  1::bigint,
  'embedding work is durably queued by the same transaction'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.audit_logs
    WHERE entity_type = 'candidate'
      AND entity_id = (SELECT id::text FROM created_candidate_ids)
      AND action = 'candidate.parsed'
  ),
  1::bigint,
  'candidate audit is committed atomically'
);
SELECT is(
  (
    SELECT count(*)
    FROM private.candidate_embedding_jobs AS j
    JOIN public.candidates AS c ON c.id = j.candidate_id
    WHERE c.first_name = 'Must' AND c.last_name = 'Rollback'
  ),
  0::bigint,
  'rolled-back candidates leave no embedding job'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.audit_logs
    WHERE entity_type = 'candidate'
      AND metadata ->> 'name' = 'Must Rollback'
  ),
  0::bigint,
  'rolled-back candidates leave no audit record'
);

SELECT * FROM finish();
ROLLBACK;
