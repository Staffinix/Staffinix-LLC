BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(12);

SELECT is(
  (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname IN ('public', 'private')
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting
        WHERE setting = 'search_path=""'
          OR (
            n.nspname = 'public'
            AND p.proname = 'rls_auto_enable'
            AND setting = 'search_path=pg_catalog'
          )
      )
  ),
  0::bigint,
  'every application SECURITY DEFINER function has a fixed safe search_path'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname IN ('public', 'private')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  0::bigint,
  'anon cannot execute any application SECURITY DEFINER function'
);

SELECT results_eq(
  $$
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname = 'public'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ORDER BY p.proname
  $$,
  $$ VALUES
    ('match_candidates_for_requirement'::name),
    ('match_requirements_for_candidate'::name),
    ('reserve_ai_usage'::name),
    ('search_candidates_semantic'::name)
  $$,
  'authenticated can execute only the reviewed public SECURITY DEFINER RPCs'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'current_tenant_id',
        'has_role',
        'is_active_user',
        'is_admin',
        'is_platform_admin'
      )
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  0::bigint,
  'public compatibility authorization helpers are not authenticated RPCs'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname = 'public'
      AND p.proname IN ('handle_new_user', 'prevent_candidate_tenant_change')
      AND (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  ),
  0::bigint,
  'trigger functions cannot be invoked directly by API roles'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname = 'public'
      AND p.proname IN (
        'search_candidates_semantic',
        'match_candidates_for_requirement',
        'match_requirements_for_candidate'
      )
      AND position('private.current_tenant_id()' IN pg_get_functiondef(p.oid)) = 0
  ),
  0::bigint,
  'every authenticated semantic RPC independently resolves the caller tenant'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname = 'private'
      AND p.proname IN ('current_tenant_id', 'has_role', 'is_admin', 'is_l4_recruiter', 'is_platform_admin')
      AND position('auth.uid()' IN pg_get_functiondef(p.oid)) = 0
  ),
  0::bigint,
  'every private authorization helper binds decisions to auth.uid()'
);

SELECT ok(
  NOT has_schema_privilege('anon', 'private', 'USAGE'),
  'anon has no access to the private schema'
);

SELECT ok(
  has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated may use private helpers from RLS policies'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname = 'private'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND p.proname NOT IN (
        'can_access_feature',
        'can_read_profile_avatar',
        'can_access_resume_staging_path',
        'claim_resume_upload',
        'current_tenant_id',
        'finish_resume_upload',
        'has_role',
        'has_platform_role',
        'issue_resume_upload',
        'is_active_user',
        'is_admin',
        'is_l4_recruiter',
        'is_platform_admin',
        'is_platform_owner',
        'set_user_role'
      )
  ),
  0::bigint,
  'authenticated has no unreviewed private SECURITY DEFINER execution grants'
);

SELECT ok(
  NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'anon'),
  'anon does not bypass RLS'
);

SELECT ok(
  NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'authenticated'),
  'authenticated does not bypass RLS'
);

SELECT * FROM finish();
ROLLBACK;
