BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(25);

INSERT INTO public.tenants (id, name, slug) VALUES
  ('31000000-0000-0000-0000-000000000001', 'Security Tenant A', 'security-extra-a'),
  ('32000000-0000-0000-0000-000000000002', 'Security Tenant B', 'security-extra-b');

INSERT INTO auth.users (id, email) VALUES
  ('daaaaaaa-0000-4000-8000-000000000001', 'extra-a@example.invalid'),
  ('daaaaaaa-0000-4000-8000-000000000002', 'extra-a2@example.invalid'),
  ('dbbbbbbb-0000-4000-8000-000000000001', 'extra-b@example.invalid'),
  ('dccccccc-0000-4000-8000-000000000001', 'extra-inactive@example.invalid');

UPDATE public.profiles
SET tenant_id = '31000000-0000-0000-0000-000000000001', is_active = true
WHERE id IN (
  'daaaaaaa-0000-4000-8000-000000000001',
  'daaaaaaa-0000-4000-8000-000000000002'
);
UPDATE public.profiles
SET tenant_id = '32000000-0000-0000-0000-000000000002', is_active = true
WHERE id = 'dbbbbbbb-0000-4000-8000-000000000001';
UPDATE public.profiles
SET tenant_id = '31000000-0000-0000-0000-000000000001', is_active = false
WHERE id = 'dccccccc-0000-4000-8000-000000000001';

INSERT INTO public.copilot_messages (tenant_id, user_id, role, content) VALUES
  ('31000000-0000-0000-0000-000000000001', 'daaaaaaa-0000-4000-8000-000000000001', 'user', 'Tenant A private prompt'),
  ('32000000-0000-0000-0000-000000000002', 'dbbbbbbb-0000-4000-8000-000000000001', 'user', 'Tenant B private prompt'),
  ('31000000-0000-0000-0000-000000000001', 'dccccccc-0000-4000-8000-000000000001', 'user', 'Inactive private prompt');

INSERT INTO storage.objects (id, bucket_id, name, owner_id) VALUES
  ('eaaaaaaa-0000-4000-8000-000000000001', 'profile-avatars', 'daaaaaaa-0000-4000-8000-000000000001/avatar', 'daaaaaaa-0000-4000-8000-000000000001'),
  ('eaaaaaaa-0000-4000-8000-000000000002', 'profile-avatars', 'daaaaaaa-0000-4000-8000-000000000002/avatar', 'daaaaaaa-0000-4000-8000-000000000002'),
  ('ebbbbbbb-0000-4000-8000-000000000001', 'profile-avatars', 'dbbbbbbb-0000-4000-8000-000000000001/avatar', 'dbbbbbbb-0000-4000-8000-000000000001'),
  ('eccccccc-0000-4000-8000-000000000001', 'profile-avatars', 'dccccccc-0000-4000-8000-000000000001/avatar', 'dccccccc-0000-4000-8000-000000000001');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.contact_us'::regclass), 'contact form has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.contact_us'::regclass), 'contact form forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.copilot_messages'::regclass), 'copilot history has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.copilot_messages'::regclass), 'copilot history forces RLS');
SELECT ok((SELECT NOT public FROM storage.buckets WHERE id = 'profile-avatars'), 'profile avatar bucket is private');
SELECT ok(has_table_privilege('anon', 'public.contact_us', 'INSERT'), 'anonymous callers may submit the contact form');
SELECT ok(NOT has_table_privilege('anon', 'public.contact_us', 'SELECT'), 'anonymous callers cannot read contact submissions');
SELECT ok(NOT has_table_privilege('anon', 'public.contact_us', 'UPDATE'), 'anonymous callers cannot update contact submissions');
SELECT ok(NOT has_table_privilege('anon', 'public.contact_us', 'DELETE'), 'anonymous callers cannot delete contact submissions');
SELECT ok(NOT has_table_privilege('anon', 'public.copilot_messages', 'SELECT,INSERT,UPDATE,DELETE'), 'anonymous callers have no copilot history privileges');
SELECT ok(has_table_privilege('authenticated', 'public.copilot_messages', 'SELECT,INSERT,DELETE'), 'authenticated callers have only required copilot privileges');
SELECT ok(NOT has_table_privilege('authenticated', 'public.copilot_messages', 'UPDATE'), 'copilot history cannot be rewritten');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'profile_avatars_select_tenant'), 'tenant avatar read policy exists');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = 'daaaaaaa-0000-4000-8000-000000000001';

SELECT results_eq('SELECT count(*) FROM public.copilot_messages', ARRAY[1::bigint], 'a user reads only their own copilot history');
SELECT results_eq($$SELECT count(*) FROM public.copilot_messages WHERE tenant_id = '32000000-0000-0000-0000-000000000002'$$, ARRAY[0::bigint], 'tenant A cannot read tenant B copilot history');
SELECT throws_ok($$INSERT INTO public.copilot_messages (tenant_id, user_id, role, content) VALUES ('32000000-0000-0000-0000-000000000002', 'daaaaaaa-0000-4000-8000-000000000001', 'user', 'forged')$$, '42501', 'new row violates row-level security policy for table "copilot_messages"', 'tenant A cannot insert tenant B copilot history');
SELECT results_eq($$DELETE FROM public.copilot_messages WHERE tenant_id = '32000000-0000-0000-0000-000000000002' RETURNING 1$$, $$SELECT 1 WHERE false$$, 'tenant A cannot delete tenant B copilot history');
SELECT results_eq('SELECT count(*) FROM storage.objects WHERE bucket_id = ''profile-avatars''', ARRAY[2::bigint], 'tenant A can read active tenant A avatars');
SELECT results_eq($$SELECT count(*) FROM storage.objects WHERE owner_id = 'dbbbbbbb-0000-4000-8000-000000000001'$$, ARRAY[0::bigint], 'tenant A cannot read tenant B avatars');

SET LOCAL "request.jwt.claim.sub" = 'dbbbbbbb-0000-4000-8000-000000000001';
SELECT results_eq('SELECT count(*) FROM public.copilot_messages', ARRAY[1::bigint], 'tenant B reads only their own copilot history');
SELECT results_eq('SELECT count(*) FROM storage.objects WHERE bucket_id = ''profile-avatars''', ARRAY[1::bigint], 'tenant B reads only tenant B avatars');

SET LOCAL "request.jwt.claim.sub" = 'dccccccc-0000-4000-8000-000000000001';
SELECT results_eq('SELECT count(*) FROM public.copilot_messages', ARRAY[0::bigint], 'inactive users cannot read copilot history');
SELECT results_eq('SELECT count(*) FROM storage.objects WHERE bucket_id = ''profile-avatars''', ARRAY[0::bigint], 'inactive users cannot read avatars');

RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.role" = 'anon';
SET LOCAL "request.jwt.claim.sub" = '';
SELECT lives_ok($$INSERT INTO public.contact_us (name, phone_number, email, description) VALUES ('Public User', '+1 555 010 0200', 'public@example.invalid', 'A valid public contact request.')$$, 'anonymous contact submission remains available');
SELECT throws_ok('SELECT count(*) FROM public.contact_us', '42501', 'permission denied for table contact_us', 'anonymous callers cannot enumerate contact submissions');

SELECT * FROM finish();
ROLLBACK;
