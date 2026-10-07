BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(74);

-- Fixed UUIDs make failures reproducible. Everything is rolled back.
INSERT INTO public.tenants (id, name, slug) VALUES
  ('10000000-0000-0000-0000-000000000001', 'RLS Tenant A', 'rls-test-a'),
  ('20000000-0000-0000-0000-000000000002', 'RLS Tenant B', 'rls-test-b');

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'rls-a@example.invalid'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'rls-admin-a@example.invalid'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'rls-b@example.invalid'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'rls-admin-b@example.invalid'),
  ('cccccccc-0000-0000-0000-000000000003', 'rls-inactive@example.invalid');

UPDATE public.profiles SET tenant_id = '10000000-0000-0000-0000-000000000001', is_active = true
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
UPDATE public.profiles SET tenant_id = '10000000-0000-0000-0000-000000000001', is_active = true
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
UPDATE public.profiles SET tenant_id = '20000000-0000-0000-0000-000000000002', is_active = true
WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
UPDATE public.profiles SET tenant_id = '20000000-0000-0000-0000-000000000002', is_active = true
WHERE id = 'bbbbbbbb-0000-0000-0000-000000000003';
UPDATE public.profiles SET tenant_id = '10000000-0000-0000-0000-000000000001', is_active = false
WHERE id = 'cccccccc-0000-0000-0000-000000000003';

INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'recruiter'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'admin'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'recruiter'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'admin'),
  ('cccccccc-0000-0000-0000-000000000003', 'admin');

INSERT INTO public.platform_admins (user_id, role) VALUES
  ('cccccccc-0000-0000-0000-000000000003', 'platform_admin');

INSERT INTO public.platform_access_requests (user_id, user_email, reason) VALUES
  (
    'cccccccc-0000-0000-0000-000000000003',
    'rls-inactive@example.invalid',
    'Inactive-profile access probe'
  );

INSERT INTO public.candidates (id, first_name, last_name, email, tenant_id, created_by, assigned_to) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Tenant', 'A', 'candidate-a@example.invalid', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002', 'Delete', 'A', 'delete-a@example.invalid', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('b2000000-0000-0000-0000-000000000002', 'Tenant', 'B', 'candidate-b@example.invalid', '20000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('b2000000-0000-0000-0000-000000000003', 'Delete', 'B', 'delete-b@example.invalid', '20000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002');

INSERT INTO public.candidate_skills (candidate_id, skill) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'A-only'), ('b2000000-0000-0000-0000-000000000002', 'B-only');
INSERT INTO public.candidate_employment (candidate_id, company) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'A-only'), ('b2000000-0000-0000-0000-000000000002', 'B-only');
INSERT INTO public.candidate_education (candidate_id, institution) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'A-only'), ('b2000000-0000-0000-0000-000000000002', 'B-only');
INSERT INTO public.candidate_projects (candidate_id, name) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'A-only'), ('b2000000-0000-0000-0000-000000000002', 'B-only');
INSERT INTO public.candidate_certifications (candidate_id, name) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'A-only'), ('b2000000-0000-0000-0000-000000000002', 'B-only');
INSERT INTO public.resumes (id, candidate_id, tenant_id, file_path, file_name, uploaded_by) VALUES
  ('aa000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'inline://a1000000-0000-0000-0000-000000000001', 'a.pdf', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bb000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'inline://b2000000-0000-0000-0000-000000000002', 'b.pdf', 'bbbbbbbb-0000-0000-0000-000000000002');
INSERT INTO public.resume_versions (candidate_id, version_no, file_path, created_by) VALUES
  ('a1000000-0000-0000-0000-000000000001', 1, 'a/v1.pdf', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('b2000000-0000-0000-0000-000000000002', 1, 'b/v1.pdf', 'bbbbbbbb-0000-0000-0000-000000000002');
INSERT INTO public.candidate_embeddings (candidate_id, embedding, model) VALUES
  ('a1000000-0000-0000-0000-000000000001', array_fill(0::real, ARRAY[3072])::vector, 'rls-test'),
  ('b2000000-0000-0000-0000-000000000002', array_fill(1::real, ARRAY[3072])::vector, 'rls-test');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-0000-0000-0000-000000000001';

SELECT results_eq('SELECT count(*) FROM public.candidates', ARRAY[2::bigint], 'A1 reads tenant A candidates');
SELECT results_eq($$SELECT count(*) FROM public.candidates WHERE id='b2000000-0000-0000-0000-000000000002'$$, ARRAY[0::bigint], 'tenant A cannot read tenant B candidate');
SELECT results_eq('SELECT count(*) FROM public.candidate_skills', ARRAY[1::bigint], 'skills are tenant isolated');
SELECT results_eq('SELECT count(*) FROM public.candidate_employment', ARRAY[1::bigint], 'employment is tenant isolated');
SELECT results_eq('SELECT count(*) FROM public.candidate_education', ARRAY[1::bigint], 'education is tenant isolated');
SELECT results_eq('SELECT count(*) FROM public.candidate_projects', ARRAY[1::bigint], 'projects are tenant isolated');
SELECT results_eq('SELECT count(*) FROM public.candidate_certifications', ARRAY[1::bigint], 'certifications are tenant isolated');
SELECT results_eq('SELECT count(*) FROM public.resumes', ARRAY[1::bigint], 'resumes are tenant isolated');
SELECT results_eq('SELECT count(*) FROM public.resume_versions', ARRAY[1::bigint], 'resume versions are tenant isolated');
SELECT results_eq('SELECT count(*) FROM public.candidate_embeddings', ARRAY[1::bigint], 'embeddings are tenant isolated');
SELECT results_eq($$SELECT count(*) FROM public.candidate_skills WHERE candidate_id='b2000000-0000-0000-0000-000000000002'$$, ARRAY[0::bigint], 'A1 cannot read tenant B skills');
SELECT results_eq($$SELECT count(*) FROM public.candidate_employment WHERE candidate_id='b2000000-0000-0000-0000-000000000002'$$, ARRAY[0::bigint], 'A1 cannot read tenant B employment');
SELECT results_eq($$SELECT count(*) FROM public.candidate_education WHERE candidate_id='b2000000-0000-0000-0000-000000000002'$$, ARRAY[0::bigint], 'A1 cannot read tenant B education');
SELECT results_eq($$SELECT count(*) FROM public.candidate_projects WHERE candidate_id='b2000000-0000-0000-0000-000000000002'$$, ARRAY[0::bigint], 'A1 cannot read tenant B projects');
SELECT results_eq($$SELECT count(*) FROM public.candidate_certifications WHERE candidate_id='b2000000-0000-0000-0000-000000000002'$$, ARRAY[0::bigint], 'A1 cannot read tenant B certifications');
SELECT results_eq($$SELECT count(*) FROM public.resume_versions WHERE candidate_id='b2000000-0000-0000-0000-000000000002'$$, ARRAY[0::bigint], 'A1 cannot read tenant B resume versions');
SELECT results_eq($$SELECT count(*) FROM public.candidate_embeddings WHERE candidate_id='b2000000-0000-0000-0000-000000000002'$$, ARRAY[0::bigint], 'A1 cannot read tenant B embeddings');
SELECT results_eq($$UPDATE public.candidates SET summary='A1 allowed' WHERE id='a1000000-0000-0000-0000-000000000001' RETURNING 1$$, ARRAY[1], 'A1 can update its tenant A candidate');
SELECT results_eq($$UPDATE public.candidates SET summary='hacked' WHERE id='b2000000-0000-0000-0000-000000000002' RETURNING 1$$, $$SELECT 1 WHERE false$$, 'cross-tenant candidate update is a no-op');
SELECT throws_ok($$UPDATE public.candidates SET tenant_id='20000000-0000-0000-0000-000000000002' WHERE id='a1000000-0000-0000-0000-000000000001'$$, 'P0001', 'Changing tenant ownership is not permitted', 'A1 cannot mutate candidate ownership to tenant B');
SELECT results_eq($$DELETE FROM public.candidate_skills WHERE candidate_id='b2000000-0000-0000-0000-000000000002' RETURNING 1$$, $$SELECT 1 WHERE false$$, 'cross-tenant child delete is a no-op');
SELECT throws_ok($$INSERT INTO public.candidates (first_name,last_name,tenant_id,created_by) VALUES ('Forged','Tenant','20000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001')$$, '42501', 'Invalid tenant ownership', 'tenant A cannot insert a tenant B candidate');
SELECT throws_ok($$INSERT INTO public.candidate_skills (candidate_id,skill) VALUES ('b2000000-0000-0000-0000-000000000002','forged')$$, '42501', 'new row violates row-level security policy for table "candidate_skills"', 'tenant A cannot insert a child under tenant B candidate');
SELECT throws_ok($$INSERT INTO public.candidate_employment (candidate_id,company) VALUES ('b2000000-0000-0000-0000-000000000002','forged')$$, '42501', 'new row violates row-level security policy for table "candidate_employment"', 'tenant A cannot insert employment under tenant B candidate');
SELECT throws_ok($$INSERT INTO public.candidate_education (candidate_id,institution) VALUES ('b2000000-0000-0000-0000-000000000002','forged')$$, '42501', 'new row violates row-level security policy for table "candidate_education"', 'tenant A cannot insert education under tenant B candidate');
SELECT throws_ok($$INSERT INTO public.candidate_projects (candidate_id,name) VALUES ('b2000000-0000-0000-0000-000000000002','forged')$$, '42501', 'new row violates row-level security policy for table "candidate_projects"', 'tenant A cannot insert project under tenant B candidate');
SELECT throws_ok($$INSERT INTO public.candidate_certifications (candidate_id,name) VALUES ('b2000000-0000-0000-0000-000000000002','forged')$$, '42501', 'new row violates row-level security policy for table "candidate_certifications"', 'tenant A cannot insert certification under tenant B candidate');
SELECT throws_ok($$INSERT INTO public.resume_versions (candidate_id,version_no,file_path,created_by) VALUES ('b2000000-0000-0000-0000-000000000002',99,'forged.pdf','aaaaaaaa-0000-0000-0000-000000000001')$$, '42501', 'new row violates row-level security policy for table "resume_versions"', 'tenant A cannot insert resume version under tenant B candidate');
SELECT throws_ok($$INSERT INTO public.candidate_embeddings (candidate_id,embedding,model) VALUES ('b2000000-0000-0000-0000-000000000003',array_fill(2::real, ARRAY[3072])::vector,'forged')$$, '42501', 'permission denied for table candidate_embeddings', 'tenant A cannot insert embedding under tenant B candidate');
SELECT throws_ok($$INSERT INTO public.resumes (candidate_id,tenant_id,file_path,file_name,uploaded_by) VALUES ('b2000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','forged','forged.pdf','aaaaaaaa-0000-0000-0000-000000000001')$$, '42501', 'Resume storage path was not issued by the server', 'tenant A cannot forge resume parent ownership');
SELECT results_eq($$SELECT count(*) FROM public.search_candidates_semantic(array_fill(0::real, ARRAY[3072])::vector, 50)$$, ARRAY[1::bigint], 'semantic candidate search cannot leak tenant B');
SELECT results_eq($$SELECT count(*) FROM public.match_requirements_for_candidate('b2000000-0000-0000-0000-000000000002', 50)$$, ARRAY[0::bigint], 'candidate-to-requirement RPC rejects a foreign candidate');
SELECT throws_ok(
  $$INSERT INTO public.platform_access_requests (user_id, tenant_id, reason) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'forged tenant')$$,
  '42501',
  'new row violates row-level security policy for table "platform_access_requests"',
  'tenant A cannot forge tenant B on a platform access request'
);
SELECT throws_ok(
  $$INSERT INTO public.platform_access_requests (user_id, tenant_id, status, reason) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'approved', 'self approved')$$,
  '42501',
  'new row violates row-level security policy for table "platform_access_requests"',
  'a caller cannot create a pre-approved platform access request'
);

SET LOCAL "request.jwt.claim.sub" = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT results_eq('SELECT count(*) FROM public.candidates', ARRAY[2::bigint], 'B1 reads tenant B candidates');
SELECT results_eq($$SELECT count(*) FROM public.candidates WHERE id='a1000000-0000-0000-0000-000000000001'$$, ARRAY[0::bigint], 'tenant B cannot read tenant A candidate');
SELECT results_eq('SELECT count(*) FROM public.candidate_skills', ARRAY[1::bigint], 'tenant B child visibility remains scoped');
SELECT results_eq('SELECT count(*) FROM public.candidate_employment', ARRAY[1::bigint], 'tenant B employment visibility remains scoped');
SELECT results_eq('SELECT count(*) FROM public.candidate_education', ARRAY[1::bigint], 'tenant B education visibility remains scoped');
SELECT results_eq('SELECT count(*) FROM public.candidate_projects', ARRAY[1::bigint], 'tenant B project visibility remains scoped');
SELECT results_eq('SELECT count(*) FROM public.candidate_certifications', ARRAY[1::bigint], 'tenant B certification visibility remains scoped');
SELECT results_eq('SELECT count(*) FROM public.resume_versions', ARRAY[1::bigint], 'tenant B resume-version visibility remains scoped');
SELECT results_eq('SELECT count(*) FROM public.resumes', ARRAY[1::bigint], 'tenant B resume visibility remains scoped');
SELECT results_eq('SELECT count(*) FROM public.candidate_embeddings', ARRAY[1::bigint], 'tenant B embedding visibility remains scoped');
SELECT results_eq($$SELECT count(*) FROM public.candidate_skills WHERE candidate_id='a1000000-0000-0000-0000-000000000001'$$, ARRAY[0::bigint], 'B1 cannot read tenant A skills');
SELECT results_eq($$SELECT count(*) FROM public.candidate_employment WHERE candidate_id='a1000000-0000-0000-0000-000000000001'$$, ARRAY[0::bigint], 'B1 cannot read tenant A employment');
SELECT results_eq($$SELECT count(*) FROM public.candidate_education WHERE candidate_id='a1000000-0000-0000-0000-000000000001'$$, ARRAY[0::bigint], 'B1 cannot read tenant A education');
SELECT results_eq($$SELECT count(*) FROM public.candidate_projects WHERE candidate_id='a1000000-0000-0000-0000-000000000001'$$, ARRAY[0::bigint], 'B1 cannot read tenant A projects');
SELECT results_eq($$SELECT count(*) FROM public.candidate_certifications WHERE candidate_id='a1000000-0000-0000-0000-000000000001'$$, ARRAY[0::bigint], 'B1 cannot read tenant A certifications');
SELECT results_eq($$SELECT count(*) FROM public.resume_versions WHERE candidate_id='a1000000-0000-0000-0000-000000000001'$$, ARRAY[0::bigint], 'B1 cannot read tenant A resume versions');
SELECT results_eq($$SELECT count(*) FROM public.candidate_embeddings WHERE candidate_id='a1000000-0000-0000-0000-000000000001'$$, ARRAY[0::bigint], 'B1 cannot read tenant A embeddings');
SELECT results_eq($$SELECT count(*) FROM public.search_candidates_semantic(array_fill(1::real, ARRAY[3072])::vector, 50)$$, ARRAY[1::bigint], 'tenant B semantic search remains scoped');

SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-0000-0000-0000-000000000002';
SELECT results_eq($$DELETE FROM public.candidates WHERE id='a1000000-0000-0000-0000-000000000002' RETURNING 1$$, ARRAY[1], 'Admin A can delete a tenant A candidate');
SELECT results_eq($$DELETE FROM public.candidates WHERE id='b2000000-0000-0000-0000-000000000003' RETURNING 1$$, $$SELECT 1 WHERE false$$, 'Admin A cannot delete a tenant B candidate');
SELECT results_eq($$SELECT count(*) FROM public.candidates WHERE id='b2000000-0000-0000-0000-000000000003'$$, ARRAY[0::bigint], 'Admin A cannot read tenant B delete target');

SET LOCAL "request.jwt.claim.sub" = 'bbbbbbbb-0000-0000-0000-000000000003';
SELECT results_eq($$SELECT count(*) FROM public.candidates WHERE id='b2000000-0000-0000-0000-000000000003'$$, ARRAY[1::bigint], 'Admin B can still read tenant B delete target');
SELECT results_eq($$DELETE FROM public.candidates WHERE id='b2000000-0000-0000-0000-000000000003' RETURNING 1$$, ARRAY[1], 'Admin B can delete a tenant B candidate');

SET LOCAL "request.jwt.claim.sub" = 'cccccccc-0000-0000-0000-000000000003';
SELECT results_eq('SELECT count(*) FROM public.candidates', ARRAY[0::bigint], 'inactive user sees no candidates');
SELECT results_eq('SELECT count(*) FROM public.candidate_skills', ARRAY[0::bigint], 'inactive user sees no child records');
SELECT results_eq('SELECT count(*) FROM public.resumes', ARRAY[0::bigint], 'inactive user sees no resumes');
SELECT results_eq('SELECT count(*) FROM public.candidate_embeddings', ARRAY[0::bigint], 'inactive user sees no embeddings');
SELECT results_eq($$SELECT count(*) FROM public.search_candidates_semantic(array_fill(0::real, ARRAY[3072])::vector, 50)$$, ARRAY[0::bigint], 'inactive user semantic search returns nothing');
SELECT results_eq('SELECT count(*) FROM public.profiles', ARRAY[0::bigint], 'inactive user cannot read even its own profile through PostgREST');
SELECT results_eq('SELECT count(*) FROM public.user_roles', ARRAY[0::bigint], 'inactive user cannot read its own role assignments');
SELECT results_eq('SELECT count(*) FROM public.platform_admins', ARRAY[0::bigint], 'inactive platform administrator loses direct database visibility');
SELECT results_eq('SELECT count(*) FROM public.platform_access_requests', ARRAY[0::bigint], 'inactive user cannot read its own platform access requests');
SELECT is((SELECT private.has_role('admin'::public.app_role)), false, 'inactive user cannot satisfy role helpers');
SELECT throws_ok(
  $$INSERT INTO public.platform_access_requests (user_id, reason, status) VALUES ('cccccccc-0000-0000-0000-000000000003', 'forged', 'denied')$$,
  '42501',
  'new row violates row-level security policy for table "platform_access_requests"',
  'inactive user cannot create a platform access request directly'
);

RESET ROLE;
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.candidates'::regclass), 'candidate RLS is enabled and forced');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.resumes'::regclass), 'resume RLS is enabled and forced');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.candidate_embeddings'::regclass), 'embedding RLS is enabled and forced');

SELECT results_eq(
  $$
    SELECT c.relname
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND c.relforcerowsecurity
      AND c.relname = ANY (ARRAY[
        'profiles','user_roles','audit_logs','tenants','platform_admins',
        'api_keys','workflow_settings','clients','vendors','requirements',
        'requirement_skills','candidates','candidate_skills',
        'candidate_employment','candidate_education','candidate_projects',
        'candidate_certifications','resumes','resume_versions',
        'candidate_embeddings','requirement_embeddings','candidate_assignment_history',
        'candidate_status_history','submissions',
        'submission_events','interviews','placements','platform_access_requests'
      ]::name[])
    ORDER BY c.relname
  $$,
  $$
    SELECT unnest(ARRAY[
      'profiles','user_roles','audit_logs','tenants','platform_admins',
      'api_keys','workflow_settings','clients','vendors','requirements',
      'requirement_skills','candidates','candidate_skills',
      'candidate_employment','candidate_education','candidate_projects',
      'candidate_certifications','resumes','resume_versions',
      'candidate_embeddings','requirement_embeddings','candidate_assignment_history',
      'candidate_status_history','submissions',
      'submission_events','interviews','placements','platform_access_requests'
    ]::name[])
    ORDER BY 1
  $$,
  'all 28 application tables have ENABLE and FORCE ROW LEVEL SECURITY'
);

SELECT results_eq(
  $$
    SELECT table_name::name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY (ARRAY[
        'profiles','user_roles','audit_logs','tenants','platform_admins',
        'api_keys','workflow_settings','clients','vendors','requirements',
        'requirement_skills','candidates','candidate_skills',
        'candidate_employment','candidate_education','candidate_projects',
        'candidate_certifications','resumes','resume_versions',
        'candidate_embeddings','requirement_embeddings','candidate_assignment_history',
        'candidate_status_history','submissions',
        'submission_events','interviews','placements','platform_access_requests'
      ])
      AND has_table_privilege('anon', format('%I.%I', table_schema, table_name), 'SELECT,INSERT,UPDATE,DELETE')
    ORDER BY table_name
  $$,
  $$SELECT NULL::name WHERE false$$,
  'anonymous role has no data privileges on any of the 28 application tables'
);

SELECT results_eq(
  $$
    SELECT tablename::name
    FROM pg_policies
    WHERE schemaname = 'public'
      AND 'anon' = ANY (roles)
      AND tablename = ANY (ARRAY[
        'profiles','user_roles','audit_logs','tenants','platform_admins',
        'api_keys','workflow_settings','clients','vendors','requirements',
        'requirement_skills','candidates','candidate_skills',
        'candidate_employment','candidate_education','candidate_projects',
        'candidate_certifications','resumes','resume_versions',
        'candidate_embeddings','requirement_embeddings','candidate_assignment_history',
        'candidate_status_history','submissions',
        'submission_events','interviews','placements','platform_access_requests'
      ])
    ORDER BY tablename
  $$,
  $$SELECT NULL::name WHERE false$$,
  'no application-table RLS policy grants anonymous access'
);

SELECT * FROM finish();
ROLLBACK;
