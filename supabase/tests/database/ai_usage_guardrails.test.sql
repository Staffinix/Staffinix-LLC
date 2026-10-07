BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(14);

SELECT has_table('private', 'ai_usage_buckets', 'AI usage buckets are private');
SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_class WHERE oid = 'private.ai_usage_buckets'::regclass),
  'AI usage buckets have forced RLS'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'private.ai_usage_buckets', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated users cannot manipulate quota buckets'
);
SELECT has_function('public', 'reserve_ai_usage', ARRAY['text'], 'AI quota reservation RPC exists');
SELECT ok(
  (SELECT prosecdef AND 'search_path=""' = ANY (proconfig)
   FROM pg_proc WHERE oid = 'public.reserve_ai_usage(text)'::regprocedure),
  'AI quota RPC is security definer with an empty search path'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.reserve_ai_usage(text)', 'EXECUTE'),
  'anonymous callers cannot reserve AI usage'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.reserve_ai_usage(text)', 'EXECUTE'),
  'authenticated callers can reserve guarded AI usage'
);

INSERT INTO public.tenants (id, name, slug) VALUES
  ('51000000-0000-4000-8000-000000000001', 'AI Quota Tenant', 'ai-quota-tenant');
INSERT INTO auth.users (id, email) VALUES
  ('5a000000-0000-4000-8000-000000000001', 'ai-active@example.invalid'),
  ('5a000000-0000-4000-8000-000000000002', 'ai-inactive@example.invalid');
UPDATE public.profiles
SET tenant_id = '51000000-0000-4000-8000-000000000001', is_active = true
WHERE id = '5a000000-0000-4000-8000-000000000001';
UPDATE public.profiles
SET tenant_id = '51000000-0000-4000-8000-000000000001', is_active = false
WHERE id = '5a000000-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '5a000000-0000-4000-8000-000000000001';

SELECT throws_ok(
  $$SELECT public.reserve_ai_usage('unknown-operation')$$,
  '42501',
  'AI usage reservation is not authorized',
  'unknown AI operations fail closed'
);
SELECT lives_ok(
  $$SELECT public.reserve_ai_usage('copilot')$$,
  'an active user can reserve a recognized AI operation'
);

RESET ROLE;
SELECT is(
  (SELECT count(*) FROM private.ai_usage_buckets),
  6::bigint,
  'one reservation atomically creates user and tenant minute/day/month buckets'
);
SELECT is(
  (SELECT token_units FROM private.ai_usage_buckets
   WHERE scope_type = 'tenant' AND period_type = 'day'),
  5000::bigint,
  'tenant daily budget receives the server-defined operation cost'
);

DELETE FROM private.ai_usage_buckets;
INSERT INTO private.ai_usage_buckets (
  scope_type, scope_id, period_type, period_start, request_count, token_units
) VALUES (
  'user', '5a000000-0000-4000-8000-000000000001', 'minute', date_trunc('minute', now()), 8, 0
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '5a000000-0000-4000-8000-000000000001';
SELECT throws_ok(
  $$SELECT public.reserve_ai_usage('copilot')$$,
  'P0001',
  'Per-user AI request limit reached',
  'per-user minute limits reject excess requests'
);

RESET ROLE;
DELETE FROM private.ai_usage_buckets;
INSERT INTO private.ai_usage_buckets (
  scope_type, scope_id, period_type, period_start, request_count, token_units
) VALUES (
  'user', '5a000000-0000-4000-8000-000000000001', 'day', date_trunc('day', now()), 0, 98000
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '5a000000-0000-4000-8000-000000000001';
SELECT throws_ok(
  $$SELECT public.reserve_ai_usage('candidate_parse')$$,
  'P0001',
  'Per-user daily AI budget reached',
  'daily token budgets reject excess reservations atomically'
);

SET LOCAL "request.jwt.claim.sub" = '5a000000-0000-4000-8000-000000000002';
SELECT throws_ok(
  $$SELECT public.reserve_ai_usage('copilot')$$,
  '42501',
  'AI usage reservation is not authorized',
  'inactive users cannot reserve AI usage'
);

SELECT * FROM finish();
ROLLBACK;
