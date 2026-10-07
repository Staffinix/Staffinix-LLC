BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(18);

SELECT has_table('public', 'email_accounts', 'email accounts table exists');
SELECT has_table('public', 'email_filter_rules', 'email rules table exists');
SELECT has_table('public', 'selected_emails', 'selected emails table exists');
SELECT has_table('public', 'email_attachments', 'email attachment metadata table exists');
SELECT has_table('public', 'email_processing_logs', 'email processing logs table exists');
SELECT has_table('public', 'email_sync_jobs', 'email sync jobs table exists');

SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.email_accounts'::regclass), 'email accounts force RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.email_filter_rules'::regclass), 'email rules force RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.selected_emails'::regclass), 'selected emails force RLS');
SELECT ok(NOT has_table_privilege('anon', 'public.email_accounts', 'SELECT'), 'anonymous callers have no email account access');

INSERT INTO public.tenants (id, name, slug) VALUES
  ('61000000-0000-4000-8000-000000000001', 'Email Tenant', 'email-tenant');
INSERT INTO auth.users (id, email) VALUES
  ('6a000000-0000-4000-8000-000000000001', 'recruiter-a@example.invalid'),
  ('6a000000-0000-4000-8000-000000000002', 'recruiter-b@example.invalid'),
  ('6a000000-0000-4000-8000-000000000003', 'admin@example.invalid');
UPDATE public.profiles SET tenant_id = '61000000-0000-4000-8000-000000000001', is_active = true
WHERE id IN (
  '6a000000-0000-4000-8000-000000000001',
  '6a000000-0000-4000-8000-000000000002',
  '6a000000-0000-4000-8000-000000000003'
);
DELETE FROM public.user_roles WHERE user_id IN (
  '6a000000-0000-4000-8000-000000000001',
  '6a000000-0000-4000-8000-000000000002',
  '6a000000-0000-4000-8000-000000000003'
);
INSERT INTO public.user_roles (user_id, role) VALUES
  ('6a000000-0000-4000-8000-000000000001', 'recruiter'),
  ('6a000000-0000-4000-8000-000000000002', 'recruiter'),
  ('6a000000-0000-4000-8000-000000000003', 'admin');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '6a000000-0000-4000-8000-000000000001';

SELECT lives_ok($$
  INSERT INTO public.email_accounts (
    id, user_id, tenant_id, provider, provider_account_id, email_address,
    encrypted_access_token, token_expires_at
  ) VALUES (
    '62000000-0000-4000-8000-000000000001',
    '6a000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    'gmail', 'gmail-a', 'recruiter-a@example.invalid', 'encrypted', now() + interval '1 hour'
  )
$$, 'L4 recruiter can create an owned email account');

SELECT throws_ok($$
  INSERT INTO public.email_accounts (
    user_id, tenant_id, provider, provider_account_id, email_address,
    encrypted_access_token, token_expires_at
  ) VALUES (
    '6a000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000001',
    'gmail', 'gmail-b', 'recruiter-b@example.invalid', 'encrypted', now() + interval '1 hour'
  )
$$, '42501', NULL, 'L4 recruiter cannot insert for another user');

RESET ROLE;
INSERT INTO public.email_accounts (
  id, user_id, tenant_id, provider, provider_account_id, email_address,
  encrypted_access_token, token_expires_at
) VALUES (
  '62000000-0000-4000-8000-000000000002',
  '6a000000-0000-4000-8000-000000000002',
  '61000000-0000-4000-8000-000000000001',
  'microsoft', 'microsoft-b', 'recruiter-b@example.invalid', 'encrypted', now() + interval '1 hour'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '6a000000-0000-4000-8000-000000000001';
SELECT is((SELECT count(*) FROM public.email_accounts), 1::bigint, 'L4 recruiter cannot SELECT another user email account');
SELECT is_empty($$UPDATE public.email_accounts SET status = 'error' WHERE id = '62000000-0000-4000-8000-000000000002' RETURNING 1$$, 'L4 recruiter cannot UPDATE another user email account');
SELECT is_empty($$DELETE FROM public.email_accounts WHERE id = '62000000-0000-4000-8000-000000000002' RETURNING 1$$, 'L4 recruiter cannot DELETE another user email account');

SELECT lives_ok($$
  INSERT INTO public.email_filter_rules (
    user_id, tenant_id, email_account_id, name
  ) VALUES (
    '6a000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    '62000000-0000-4000-8000-000000000001',
    'Applications'
  )
$$, 'L4 recruiter can create an owned filter rule');

SET LOCAL "request.jwt.claim.sub" = '6a000000-0000-4000-8000-000000000003';
SELECT is((SELECT count(*) FROM public.email_accounts), 0::bigint, 'L3/admin role cannot SELECT email accounts');
SELECT throws_ok($$
  INSERT INTO public.email_accounts (
    user_id, tenant_id, provider, provider_account_id, email_address,
    encrypted_access_token, token_expires_at
  ) VALUES (
    '6a000000-0000-4000-8000-000000000003',
    '61000000-0000-4000-8000-000000000001',
    'gmail', 'gmail-admin', 'admin@example.invalid', 'encrypted', now() + interval '1 hour'
  )
$$, '42501', NULL, 'non-L4 roles cannot create email accounts');

SELECT * FROM finish();
ROLLBACK;
