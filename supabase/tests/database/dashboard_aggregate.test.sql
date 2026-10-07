BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(13);

SELECT has_function(
  'public',
  'dashboard_overview',
  ARRAY[]::text[],
  'dashboard overview RPC exists'
);
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.dashboard_overview()'::regprocedure),
  'dashboard overview executes as the authenticated caller'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.dashboard_overview()', 'EXECUTE'),
  'authenticated users can call the dashboard RPC'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.dashboard_overview()', 'EXECUTE'),
  'anonymous users cannot call the dashboard RPC'
);

INSERT INTO public.tenants (id, name, slug) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'Dashboard Tenant A', 'dashboard-test-a'),
  ('d2000000-0000-0000-0000-000000000002', 'Dashboard Tenant B', 'dashboard-test-b');

INSERT INTO auth.users (id, email) VALUES
  ('da000000-0000-0000-0000-000000000001', 'dashboard-admin-a@example.invalid'),
  ('db000000-0000-0000-0000-000000000002', 'dashboard-admin-b@example.invalid'),
  ('db000000-0000-0000-0000-000000000003', 'dashboard-user-b@example.invalid'),
  ('dc000000-0000-0000-0000-000000000003', 'dashboard-inactive@example.invalid');

UPDATE public.profiles
SET tenant_id = 'd1000000-0000-0000-0000-000000000001', is_active = true
WHERE id = 'da000000-0000-0000-0000-000000000001';
UPDATE public.profiles
SET tenant_id = 'd2000000-0000-0000-0000-000000000002', is_active = true
WHERE id IN (
  'db000000-0000-0000-0000-000000000002',
  'db000000-0000-0000-0000-000000000003'
);
UPDATE public.profiles
SET tenant_id = 'd1000000-0000-0000-0000-000000000001', is_active = false
WHERE id = 'dc000000-0000-0000-0000-000000000003';

INSERT INTO public.user_roles (user_id, role) VALUES
  ('da000000-0000-0000-0000-000000000001', 'admin'),
  ('db000000-0000-0000-0000-000000000002', 'admin');

-- These fixtures test the reporting function rather than submission workflow
-- triggers, so insert a compact historical snapshot with triggers disabled.
SET LOCAL session_replication_role = replica;

INSERT INTO public.candidates (
  id, first_name, last_name, tenant_id, created_by, status,
  availability, primary_technology, visa_status
) VALUES
  (
    'd1c00000-0000-0000-0000-000000000001', 'Candidate', 'A',
    'd1000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001',
    'active', 'immediate', 'Java', 'H1B'
  ),
  (
    'd2c00000-0000-0000-0000-000000000002', 'Candidate', 'B1',
    'd2000000-0000-0000-0000-000000000002', 'db000000-0000-0000-0000-000000000002',
    'active', 'immediate', 'Python', 'USC'
  ),
  (
    'd2c00000-0000-0000-0000-000000000003', 'Candidate', 'B2',
    'd2000000-0000-0000-0000-000000000002', 'db000000-0000-0000-0000-000000000002',
    'active', 'two_weeks', 'Go', 'GC'
  );

INSERT INTO public.requirements (
  id, title, tenant_id, created_by, status, priority
) VALUES
  (
    'd1e00000-0000-0000-0000-000000000001', 'Tenant A role',
    'd1000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001',
    'open', 'urgent'
  ),
  (
    'd2e00000-0000-0000-0000-000000000002', 'Tenant B role',
    'd2000000-0000-0000-0000-000000000002', 'db000000-0000-0000-0000-000000000002',
    'open', 'urgent'
  );

INSERT INTO public.submissions (
  id, requirement_id, candidate_id, tenant_id, created_by, stage, submitted_at, updated_at
) VALUES
  (
    'd1500000-0000-0000-0000-000000000001',
    'd1e00000-0000-0000-0000-000000000001',
    'd1c00000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    'da000000-0000-0000-0000-000000000001',
    'hired', now() - INTERVAL '1 day', now() - INTERVAL '1 day'
  ),
  (
    'd2500000-0000-0000-0000-000000000002',
    'd2e00000-0000-0000-0000-000000000002',
    'd2c00000-0000-0000-0000-000000000002',
    'd2000000-0000-0000-0000-000000000002',
    'db000000-0000-0000-0000-000000000002',
    'hired', now() - INTERVAL '1 day', now() - INTERVAL '1 day'
  );

INSERT INTO public.interviews (
  id, submission_id, tenant_id, outcome
) VALUES (
  'd1600000-0000-0000-0000-000000000001',
  'd1500000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  'scheduled'
);

INSERT INTO public.placements (
  id, submission_id, candidate_id, requirement_id, tenant_id, status
) VALUES (
  'd1700000-0000-0000-0000-000000000001',
  'd1500000-0000-0000-0000-000000000001',
  'd1c00000-0000-0000-0000-000000000001',
  'd1e00000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  'active'
);

SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = 'da000000-0000-0000-0000-000000000001';

SELECT is(
  public.dashboard_overview() #>> '{kpis,activeConsultants}',
  '1',
  'candidate KPI excludes other tenants'
);
SELECT is(
  public.dashboard_overview() #>> '{kpis,openRequirements}',
  '1',
  'requirement KPI excludes other tenants'
);
SELECT is(
  jsonb_array_length(public.dashboard_overview() -> 'trend'),
  14,
  'submission trend always contains fourteen daily buckets'
);
SELECT is(
  (
    SELECT stage ->> 'count'
    FROM jsonb_array_elements(public.dashboard_overview() -> 'funnel') AS stage
    WHERE stage ->> 'stage' = 'hired'
  ),
  '1',
  'pipeline funnel excludes other tenants'
);
SELECT ok(
  NOT (public.dashboard_overview() @> jsonb_build_object(
    'recruiters', jsonb_build_array(jsonb_build_object(
      'id', 'db000000-0000-0000-0000-000000000002'
    ))
  )),
  'top recruiters cannot include another tenant'
);
SELECT is(
  public.dashboard_overview() #>> '{bench,total}',
  '1',
  'bench aggregate excludes other tenants'
);
SELECT is(
  (
    SELECT priority ->> 'value'
    FROM jsonb_array_elements(
      public.dashboard_overview() #> '{requirements,by_priority}'
    ) AS priority
    WHERE priority ->> 'name' = 'urgent'
  ),
  '1',
  'requirement breakdown excludes other tenants'
);
SELECT is(
  public.dashboard_overview() #>> '{kpis,activePlacements}',
  '1',
  'placement KPI is aggregated in the database'
);

SET LOCAL "request.jwt.claim.sub" = 'dc000000-0000-0000-0000-000000000003';
SELECT is(
  public.dashboard_overview(),
  NULL::jsonb,
  'inactive users receive no dashboard payload'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
