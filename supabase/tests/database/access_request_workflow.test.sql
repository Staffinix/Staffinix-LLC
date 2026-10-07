BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(18);

INSERT INTO public.tenants (id, name, slug)
VALUES ('91000000-0000-0000-0000-000000000001', 'Access Test Tenant', 'access-test-tenant');

INSERT INTO auth.users (id, email) VALUES
  ('91000000-0000-0000-0000-000000000011', 'requester@access-test.invalid'),
  ('91000000-0000-0000-0000-000000000012', 'other@access-test.invalid'),
  ('91000000-0000-0000-0000-000000000013', 'approver@access-test.invalid');

UPDATE public.profiles
SET tenant_id = '91000000-0000-0000-0000-000000000001', is_active = true
WHERE id IN (
  '91000000-0000-0000-0000-000000000011',
  '91000000-0000-0000-0000-000000000012',
  '91000000-0000-0000-0000-000000000013'
);

INSERT INTO public.platform_admins (user_id, role)
VALUES ('91000000-0000-0000-0000-000000000013', 'platform_admin');

INSERT INTO public.platform_access_requests (
  user_id, user_email, tenant_id, requested_tier, reason
) VALUES (
  '91000000-0000-0000-0000-000000000013',
  'approver@access-test.invalid',
  '91000000-0000-0000-0000-000000000001',
  'l3_developer',
  'Self approval must be rejected'
);

SELECT is(
  (SELECT array_agg(enumlabel::text ORDER BY enumsortorder)
   FROM pg_enum
   WHERE enumtypid = 'public.requestable_access_tier'::regtype),
  ARRAY['l2_admin', 'l3_developer', 'l4_recruiter']::text[],
  'only L2, L3, and L4 are requestable'
);

SELECT is(
  'platform_support' = ANY(enum_range(NULL::public.requestable_access_tier)::text[]),
  false,
  'Platform Support is not requestable'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '91000000-0000-0000-0000-000000000011';

INSERT INTO public.platform_access_requests (
  user_id, user_email, tenant_id, requested_tier, reason, status, reviewed_by, reviewed_at
) VALUES (
  '91000000-0000-0000-0000-000000000012',
  'forged@access-test.invalid',
  NULL,
  'l2_admin',
  'Valid business justification',
  'approved',
  '91000000-0000-0000-0000-000000000012',
  now()
);

SELECT results_eq(
  $$SELECT count(*) FROM public.platform_access_requests WHERE status='pending'$$,
  ARRAY[1::bigint],
  'requester creates one pending request'
);
SELECT results_eq(
  $$SELECT user_id FROM public.platform_access_requests WHERE status='pending'$$,
  ARRAY['91000000-0000-0000-0000-000000000011'::uuid],
  'request identity is bound to auth.uid'
);
SELECT results_eq(
  $$SELECT user_email FROM public.platform_access_requests WHERE status='pending'$$,
  ARRAY['requester@access-test.invalid'::text],
  'request email is bound to the verified auth user'
);
SELECT results_eq(
  $$SELECT count(*) FROM public.platform_access_requests
    WHERE status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL$$,
  ARRAY[1::bigint],
  'requester cannot forge approval fields'
);

SELECT throws_ok(
  $$INSERT INTO public.platform_access_requests
    (user_id, requested_tier, reason)
    VALUES ('91000000-0000-0000-0000-000000000011', 'l4_recruiter', 'Second pending request')$$,
  '23505',
  NULL,
  'database constraint rejects a duplicate pending request'
);

SELECT throws_ok(
  $$INSERT INTO public.platform_access_requests
    (user_id, requested_tier, reason)
    VALUES ('91000000-0000-0000-0000-000000000011', 'l4_recruiter', '   ')$$,
  '23514',
  NULL,
  'database rejects whitespace-only justification'
);

SELECT throws_ok(
  $$UPDATE public.platform_access_requests SET status='approved' WHERE status='pending'$$,
  '42501',
  NULL,
  'requester cannot directly approve a request'
);

SELECT results_eq(
  $$SELECT count(*) FROM public.user_roles WHERE user_id='91000000-0000-0000-0000-000000000011'$$,
  ARRAY[0::bigint],
  'request submission does not grant a role'
);

SELECT throws_ok(
  $$SELECT * FROM public.review_platform_access_request(
      (SELECT id FROM public.platform_access_requests WHERE status='pending'), true, NULL
    )$$,
  '42501',
  'Platform administrator privileges required',
  'ordinary requester cannot invoke approval'
);

SET LOCAL "request.jwt.claim.sub" = '91000000-0000-0000-0000-000000000012';
SELECT results_eq(
  $$SELECT count(*) FROM public.platform_access_requests$$,
  ARRAY[0::bigint],
  'another user cannot read the requester access request'
);

SET LOCAL "request.jwt.claim.sub" = '91000000-0000-0000-0000-000000000013';
SELECT throws_ok(
  $$SELECT * FROM public.review_platform_access_request(
      (SELECT id FROM public.platform_access_requests
       WHERE user_id='91000000-0000-0000-0000-000000000013'), true, NULL
    )$$,
  '42501',
  'Reviewers cannot approve their own requests',
  'platform administrator cannot self-approve'
);

SELECT lives_ok(
  $$SELECT * FROM public.review_platform_access_request(
      (SELECT id FROM public.platform_access_requests
       WHERE user_id='91000000-0000-0000-0000-000000000011'), true, 'Approved in test'
    )$$,
  'authorized reviewer can approve another user request'
);

RESET ROLE;
SELECT results_eq(
  $$SELECT role::text FROM public.user_roles
    WHERE user_id='91000000-0000-0000-0000-000000000011'$$,
  ARRAY['admin'::text],
  'approved L2 request assigns only the admin application role'
);
SELECT results_eq(
  $$SELECT status::text FROM public.platform_access_requests
    WHERE user_id='91000000-0000-0000-0000-000000000011'$$,
  ARRAY['approved'::text],
  'approved request is no longer pending'
);
SELECT results_eq(
  $$SELECT reviewed_by FROM public.platform_access_requests
    WHERE user_id='91000000-0000-0000-0000-000000000011'$$,
  ARRAY['91000000-0000-0000-0000-000000000013'::uuid],
  'review audit records the verified approver'
);
SELECT results_eq(
  $$SELECT count(*) FROM public.platform_access_requests
    WHERE user_id='91000000-0000-0000-0000-000000000011' AND status='pending'$$,
  ARRAY[0::bigint],
  'approval closes the pending request'
);

SELECT * FROM finish();
ROLLBACK;
