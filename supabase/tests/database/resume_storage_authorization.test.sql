BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(17);

SELECT has_table('private', 'resume_upload_grants', 'resume upload grants are private');
SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_class WHERE oid = 'private.resume_upload_grants'::regclass),
  'resume upload grants have forced RLS'
);
SELECT has_function(
  'public', 'issue_resume_upload', ARRAY['text', 'text', 'bigint'],
  'server upload issuer exists'
);
SELECT has_function(
  'public', 'create_candidate_graph_from_resume_upload',
  ARRAY['jsonb', 'uuid', 'jsonb', 'jsonb', 'jsonb', 'jsonb', 'jsonb', 'text'],
  'candidate creation consumes an upload identifier'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.issue_resume_upload(text,text,bigint)', 'EXECUTE'),
  'anonymous callers cannot issue resume uploads'
);

INSERT INTO public.tenants (id, name, slug) VALUES
  ('41000000-0000-4000-8000-000000000001', 'Resume Path Tenant', 'resume-path-tenant');
INSERT INTO auth.users (id, email) VALUES
  ('4a000000-0000-4000-8000-000000000001', 'resume-path@example.invalid');
UPDATE public.profiles
SET tenant_id = '41000000-0000-4000-8000-000000000001', is_active = true
WHERE id = '4a000000-0000-4000-8000-000000000001';

INSERT INTO public.user_roles (user_id, role) VALUES
  ('4a000000-0000-4000-8000-000000000001', 'recruiter');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '4a000000-0000-4000-8000-000000000001';

CREATE TEMP TABLE issued_upload AS
SELECT * FROM public.issue_resume_upload('verified.pdf', 'application/pdf', 1024);
GRANT SELECT ON issued_upload TO authenticated;

SELECT is((SELECT count(*) FROM issued_upload), 1::bigint, 'one upload grant is issued');
SELECT matches(
  (SELECT staging_path FROM issued_upload),
  '^41000000-0000-4000-8000-000000000001/4a000000-0000-4000-8000-000000000001/[0-9a-f-]{36}\.pdf$',
  'staging path is derived from the tenant and authenticated user'
);

SELECT throws_ok(
  $$
    SELECT * FROM public.issue_resume_upload(
      '../forged.pdf', 'application/pdf', 1024
    )
  $$,
  '22023',
  'Invalid resume file name',
  'file names cannot inject an object path'
);
SELECT throws_ok(
  $$
    SELECT * FROM public.issue_resume_upload(
      'misleading.docx', 'application/pdf', 1024
    )
  $$,
  '22023',
  'Unsupported resume type or size',
  'file name extension must match the declared type'
);

SELECT throws_ok(
  $$
    SELECT * FROM public.create_candidate_graph(
      '{"first_name":"Forged","last_name":"Path","source":"pdf"}'::jsonb,
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
      '{"file_path":"41000000-0000-4000-8000-000000000001/forged/resume.pdf","file_name":"resume.pdf","mime_type":"application/pdf"}'::jsonb
    )
  $$,
  '42501',
  'Resume storage path was not issued by the server',
  'legacy candidate RPC cannot persist a caller-selected storage path'
);

CREATE TEMP TABLE created_resume AS
SELECT *
FROM public.create_candidate_graph_from_resume_upload(
  '{"first_name":"Canonical","last_name":"Resume","source":"pdf"}'::jsonb,
  (SELECT upload_id FROM issued_upload),
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  'Verified facts'
);
GRANT SELECT ON created_resume TO authenticated;

SELECT matches(
  (SELECT resume_path FROM created_resume),
  '^41000000-0000-4000-8000-000000000001/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$',
  'permanent path is tenant/candidate/random.pdf'
);
SELECT is(
  split_part((SELECT resume_path FROM created_resume), '/', 2),
  (SELECT candidate_id::text FROM created_resume),
  'path candidate component is the authoritative created candidate id'
);
SELECT is(
  (SELECT file_path FROM public.resumes WHERE candidate_id = (SELECT candidate_id FROM created_resume)),
  (SELECT resume_path FROM created_resume),
  'resume row stores only the canonical path'
);
SELECT throws_ok(
  format(
    'SELECT * FROM public.authorize_resume_upload(%L::uuid)',
    (SELECT upload_id FROM issued_upload)
  ),
  '42501',
  'Resume upload not found, expired, or already consumed',
  'consumed upload is no longer authorized'
);
SELECT throws_ok(
  format(
    'SELECT * FROM public.create_candidate_graph_from_resume_upload(%L::jsonb, %L::uuid)',
    '{"first_name":"Replay","last_name":"Blocked"}',
    (SELECT upload_id FROM issued_upload)
  ),
  '42501',
  'Resume upload not found, expired, or already consumed',
  'an upload identifier cannot be replayed'
);

RESET ROLE;

SELECT ok(
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'resume-uploads' AND NOT public),
  'resume staging bucket is private'
);
SELECT is(
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'resumes' AND name LIKE '%../%'),
  0::bigint,
  'no traversal-shaped permanent resume objects exist'
);

SELECT * FROM finish();
ROLLBACK;
