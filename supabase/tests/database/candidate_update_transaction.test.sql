BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(9);
SELECT has_function('public','update_candidate_graph',ARRAY['uuid','jsonb','jsonb']);
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.update_candidate_graph(uuid,jsonb,jsonb)'::regprocedure), 'RLS remains authoritative');
SELECT ok(NOT has_function_privilege('anon','public.update_candidate_graph(uuid,jsonb,jsonb)','EXECUTE'), 'anonymous execution denied');
INSERT INTO public.tenants(id,name,slug) VALUES ('41000000-0000-0000-0000-000000000001','Update test','update-test');
INSERT INTO auth.users(id,email) VALUES ('4a000000-0000-0000-0000-000000000001','update-test@example.invalid');
UPDATE public.profiles SET tenant_id='41000000-0000-0000-0000-000000000001',is_active=true WHERE id='4a000000-0000-0000-0000-000000000001';
INSERT INTO public.user_roles(user_id,role) VALUES ('4a000000-0000-0000-000000000001','recruiter');
CREATE TEMP TABLE update_test_ids(id uuid);
GRANT SELECT,INSERT ON update_test_ids TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role"='authenticated';
SET LOCAL "request.jwt.claim.sub"='4a000000-0000-0000-0000-000000000001';
INSERT INTO update_test_ids SELECT candidate_id FROM public.create_candidate_graph(
  '{"first_name":"Before","last_name":"Test","assigned_to":"4a000000-0000-0000-0000-000000000001"}',
  '[{"skill":"SQL"}]', '[{"company":"Original"}]'
);
SELECT lives_ok($q$ SELECT * FROM public.update_candidate_graph((SELECT id FROM update_test_ids),'{"first_name":"After"}') $q$, 'parent-only save succeeds');
SELECT is((SELECT count(*)::integer FROM public.candidate_employment WHERE candidate_id=(SELECT id FROM update_test_ids)),1,'omitted employment preserved');
SELECT throws_ok($q$ SELECT * FROM public.update_candidate_graph((SELECT id FROM update_test_ids),'{"first_name":"Lost"}','{"employment":[{"company":null}]}') $q$, '23502', NULL, 'invalid child rejects entire save');
SELECT is((SELECT first_name FROM public.candidates WHERE id=(SELECT id FROM update_test_ids)),'After','parent rolled back');
SELECT is((SELECT company FROM public.candidate_employment WHERE candidate_id=(SELECT id FROM update_test_ids)),'Original','deleted child restored on failure');
SELECT lives_ok($q$ SELECT * FROM public.update_candidate_graph((SELECT id FROM update_test_ids),'{}','{"employment":[]}') $q$, 'explicit empty collection clears');
SELECT * FROM finish();
ROLLBACK;
