\set ON_ERROR_STOP on
\pset pager off
\timing on

-- Run against a staging database containing representative, analyzed data:
-- DATABASE_URL=... AUDIT_TENANT_ID=... AUDIT_USER_ID=... npm run audit:database-performance
-- This file is intentionally read-only. Review its plans before adding or dropping indexes.

BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT c.relname AS table_name,
       c.reltuples::bigint AS estimated_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = ANY (ARRAY[
    'candidates', 'candidate_skills', 'resumes', 'resume_versions',
    'profiles', 'user_roles', 'requirements', 'submissions', 'interviews',
    'placements', 'candidate_embeddings',
    'platform_access_requests'
  ])
ORDER BY c.relname;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = ANY (ARRAY[
    'candidates', 'candidate_skills', 'resumes', 'resume_versions',
    'profiles', 'user_roles', 'requirements', 'submissions', 'interviews',
    'placements', 'candidate_embeddings',
    'platform_access_requests'
  ])
ORDER BY tablename, indexname;

\echo 'candidate search'
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, FORMAT TEXT)
SELECT c.id
FROM public.candidates c
WHERE c.tenant_id = :'audit_tenant_id'::uuid
  AND (
    c.first_name ILIKE '%java%'
    OR c.last_name ILIKE '%java%'
    OR c.email ILIKE '%java%'
    OR c.primary_technology ILIKE '%java%'
  )
  AND EXISTS (
    SELECT 1
    FROM public.candidate_skills cs
    WHERE cs.candidate_id = c.id
      AND cs.skill ILIKE '%java%'
  )
ORDER BY c.created_at DESC
LIMIT 20;

\echo 'candidate filtering'
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, FORMAT TEXT)
SELECT c.id
FROM public.candidates c
WHERE c.tenant_id = :'audit_tenant_id'::uuid
  AND c.status = 'active'
  AND c.assigned_to = :'audit_user_id'::uuid
ORDER BY c.created_at DESC
LIMIT 20;

\echo 'dashboard candidate KPI'
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, FORMAT TEXT)
SELECT count(*)
FROM public.candidates c
WHERE c.tenant_id = :'audit_tenant_id'::uuid
  AND c.status = 'active';

\echo 'dashboard 14-day submission trend'
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, FORMAT TEXT)
SELECT (s.submitted_at AT TIME ZONE 'UTC')::date AS day,
       count(*) AS submissions,
       count(*) FILTER (WHERE s.stage = 'hired') AS hired
FROM public.submissions s
WHERE s.tenant_id = :'audit_tenant_id'::uuid
  AND s.submitted_at >= now() - INTERVAL '14 days'
GROUP BY (s.submitted_at AT TIME ZONE 'UTC')::date;

\echo 'dashboard top recruiters'
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, FORMAT TEXT)
SELECT s.created_by,
       count(*) AS submissions,
       count(*) FILTER (WHERE s.stage = 'hired') AS hires
FROM public.submissions s
WHERE s.tenant_id = :'audit_tenant_id'::uuid
  AND s.submitted_at >= now() - INTERVAL '30 days'
  AND s.created_by IS NOT NULL
GROUP BY s.created_by
ORDER BY count(*) DESC, s.created_by
LIMIT 5;

\echo 'dashboard bench statistics'
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, FORMAT TEXT)
SELECT c.availability, c.visa_status, c.primary_technology, count(*)
FROM public.candidates c
WHERE c.tenant_id = :'audit_tenant_id'::uuid
  AND c.status IN ('active', 'on_hold')
GROUP BY c.availability, c.visa_status, c.primary_technology;

\echo 'requirement search'
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, FORMAT TEXT)
SELECT r.id
FROM public.requirements r
WHERE r.tenant_id = :'audit_tenant_id'::uuid
  AND r.title ILIKE '%engineer%'
ORDER BY r.created_at DESC
LIMIT 20;

\echo 'semantic candidate search'
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, FORMAT TEXT)
SELECT ce.candidate_id
FROM public.candidate_embeddings ce
JOIN public.candidates c ON c.id = ce.candidate_id
WHERE c.tenant_id = :'audit_tenant_id'::uuid
ORDER BY ce.embedding::halfvec(3072)
         <=> array_fill(0::real, ARRAY[3072])::vector::halfvec(3072)
LIMIT 25;

\echo 'access-request listing'
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, FORMAT TEXT)
SELECT ar.id
FROM public.platform_access_requests ar
WHERE ar.user_id = :'audit_user_id'::uuid
ORDER BY ar.created_at DESC
LIMIT 20;

\echo 'tenant-scoped dashboard RPC'
SELECT set_config('request.jwt.claim.sub', :'audit_user_id', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, FORMAT TEXT)
SELECT public.dashboard_overview();
RESET ROLE;

ROLLBACK;
