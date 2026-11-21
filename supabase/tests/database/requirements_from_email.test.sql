BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(12);

INSERT INTO public.tenants (id, name, slug) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'Mail Tenant', 'mail-tenant');

INSERT INTO auth.users (id, email) VALUES
  ('e2000000-0000-4000-8000-000000000001', 'mail-owner@example.invalid'),
  ('e2000000-0000-4000-8000-000000000002', 'mail-peer@example.invalid');

UPDATE public.profiles
SET tenant_id = 'e1000000-0000-4000-8000-000000000001', is_active = true
WHERE id IN ('e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('e2000000-0000-4000-8000-000000000001', 'recruiter'),
  ('e2000000-0000-4000-8000-000000000002', 'recruiter');

INSERT INTO public.email_accounts (
  id, user_id, tenant_id, provider, provider_account_id, email_address,
  encrypted_access_token, token_expires_at
) VALUES (
  'e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001', 'gmail', 'gmail-mail-owner',
  'mail-owner@example.invalid', 'encrypted', now() + interval '1 hour'
);

INSERT INTO public.selected_emails (
  id, user_id, tenant_id, email_account_id, provider_message_id, sender_name, sender_email,
  subject, preview, received_at, relevance_score
)
SELECT v.id::uuid, 'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001',
  v.message, 'Priya Vendor', 'priya@vendor.example', v.subject, 'Preview text',
  '2026-11-20T10:00:00Z', 0.9
FROM (VALUES
  ('e4000000-0000-4000-8000-000000000001', 'm1', 'Fwd: RE: Senior Java Developer'),
  ('e4000000-0000-4000-8000-000000000002', 'm2', 'Data Engineer')
) AS v(id, message, subject);

SELECT ok(
  NOT has_function_privilege('anon', 'public.create_requirement_from_email(uuid,text)', 'EXECUTE'),
  'anonymous callers cannot create requirements from email'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = 'e2000000-0000-4000-8000-000000000002';
SELECT throws_ok(
  $$SELECT public.create_requirement_from_email('e4000000-0000-4000-8000-000000000001', 'x')$$,
  '42501', 'Email not found or access denied',
  'an L4 cannot import a colleague''s private email'
);

SET LOCAL "request.jwt.claim.sub" = 'e2000000-0000-4000-8000-000000000001';
SELECT isnt(
  public.create_requirement_from_email('e4000000-0000-4000-8000-000000000001', 'Full job text'),
  NULL,
  'the mailbox owner can create a requirement from their email'
);
SELECT results_eq(
  $$SELECT title, description, source::text, source_email_sender_name,
           source_email_sender_address, created_by::text
    FROM public.requirements WHERE source_email_id = 'e4000000-0000-4000-8000-000000000001'$$,
  $$VALUES ('Senior Java Developer'::text, 'Full job text'::text, 'email'::text,
            'Priya Vendor'::text, 'priya@vendor.example'::text,
            'e2000000-0000-4000-8000-000000000001'::text)$$,
  'the requirement records the mail source, sender and creator'
);
SELECT is(
  public.create_requirement_from_email('e4000000-0000-4000-8000-000000000001', 'Again'),
  NULL,
  'syncing the same email again does nothing'
);
SELECT results_eq(
  $$SELECT count(*) FROM public.requirements
    WHERE source_email_sender_address = 'priya@vendor.example'$$,
  ARRAY[1::bigint],
  'one email creates one requirement'
);
SELECT throws_ok(
  $$INSERT INTO public.requirements (title, tenant_id, created_by, source_email_sender_address)
    VALUES ('Forged', 'e1000000-0000-4000-8000-000000000001',
            'e2000000-0000-4000-8000-000000000001', 'ceo@forged.example')$$,
  '42501', 'Requirement email source cannot be edited',
  'a user cannot create a requirement with a forged sender'
);
SELECT throws_ok(
  $$UPDATE public.requirements SET source_email_sender_address = 'ceo@forged.example'
    WHERE source_email_id = 'e4000000-0000-4000-8000-000000000001'$$,
  '42501', 'Requirement email source cannot be edited',
  'a user cannot change the recorded sender'
);
SELECT lives_ok(
  $$UPDATE public.requirements SET title = 'Edited title'
    WHERE source_email_id = 'e4000000-0000-4000-8000-000000000001'$$,
  'normal requirement fields stay editable'
);
DELETE FROM public.requirements WHERE source_email_id = 'e4000000-0000-4000-8000-000000000001';
SELECT is(
  public.create_requirement_from_email('e4000000-0000-4000-8000-000000000001', 'Again'),
  NULL,
  'a deleted requirement is not recreated by the next sync'
);

SET LOCAL "request.jwt.claim.sub" = 'e2000000-0000-4000-8000-000000000002';
RESET ROLE;
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.role" = 'service_role';
SET LOCAL "request.jwt.claim.sub" = '';
SELECT isnt(
  public.create_requirement_from_email('e4000000-0000-4000-8000-000000000002', NULL),
  NULL,
  'the scheduled sync can create a requirement'
);
SELECT is(
  (SELECT created_by FROM public.requirements
   WHERE source_email_id = 'e4000000-0000-4000-8000-000000000002'),
  'e2000000-0000-4000-8000-000000000001'::uuid,
  'a scheduled import is attributed to the mailbox owner'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
