BEGIN;

-- Dashboard reads are tenant-scoped by RLS and execute as the authenticated
-- caller. Composite/partial indexes match the equality and time-range filters
-- used below so the aggregates can use index-only scans as tables grow.
CREATE INDEX IF NOT EXISTS profiles_dashboard_active_idx
  ON public.profiles (tenant_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS requirements_dashboard_status_idx
  ON public.requirements (tenant_id, status);

CREATE INDEX IF NOT EXISTS requirements_dashboard_priority_idx
  ON public.requirements (tenant_id, priority);

CREATE INDEX IF NOT EXISTS submissions_dashboard_submitted_idx
  ON public.submissions (tenant_id, submitted_at DESC)
  INCLUDE (stage, created_by)
  WHERE submitted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS submissions_dashboard_stage_updated_idx
  ON public.submissions (tenant_id, stage, updated_at DESC);

CREATE INDEX IF NOT EXISTS candidates_dashboard_bench_idx
  ON public.candidates (tenant_id, status, availability)
  INCLUDE (primary_technology, visa_status)
  WHERE status IN ('active'::public.candidate_status, 'on_hold'::public.candidate_status);

CREATE INDEX IF NOT EXISTS interviews_dashboard_outcome_idx
  ON public.interviews (tenant_id, outcome);

CREATE INDEX IF NOT EXISTS placements_dashboard_status_idx
  ON public.placements (tenant_id, status);

CREATE OR REPLACE FUNCTION public.dashboard_overview()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH
  request_context AS MATERIALIZED (
    SELECT
      identity.tenant_id,
      statement_timestamp() AS now_at,
      (statement_timestamp() AT TIME ZONE 'UTC')::date AS today
    FROM (
      SELECT
        (SELECT auth.uid()) AS user_id,
        (SELECT private.current_tenant_id()) AS tenant_id
    ) AS identity
    WHERE identity.user_id IS NOT NULL
      AND identity.tenant_id IS NOT NULL
  ),
  recent_submissions AS MATERIALIZED (
    SELECT s.stage, s.submitted_at, s.created_by
    FROM public.submissions AS s
    CROSS JOIN request_context AS ctx
    WHERE s.tenant_id = ctx.tenant_id
      AND s.submitted_at >= ctx.now_at - INTERVAL '30 days'
  ),
  submission_stage_counts AS MATERIALIZED (
    SELECT s.stage::text AS stage, count(*) AS row_count
    FROM public.submissions AS s
    CROSS JOIN request_context AS ctx
    WHERE s.tenant_id = ctx.tenant_id
    GROUP BY s.stage
  ),
  requirement_status_counts AS MATERIALIZED (
    SELECT r.status::text AS status, count(*) AS row_count
    FROM public.requirements AS r
    CROSS JOIN request_context AS ctx
    WHERE r.tenant_id = ctx.tenant_id
    GROUP BY r.status
  ),
  requirement_priority_counts AS MATERIALIZED (
    SELECT r.priority::text AS priority, count(*) AS row_count
    FROM public.requirements AS r
    CROSS JOIN request_context AS ctx
    WHERE r.tenant_id = ctx.tenant_id
    GROUP BY r.priority
  ),
  bench_source AS MATERIALIZED (
    SELECT c.status, c.availability, c.primary_technology, c.visa_status
    FROM public.candidates AS c
    CROSS JOIN request_context AS ctx
    WHERE c.tenant_id = ctx.tenant_id
      AND c.status IN (
        'active'::public.candidate_status,
        'on_hold'::public.candidate_status
      )
  ),
  kpis AS (
    SELECT jsonb_build_object(
      'teamMembers', (
        SELECT count(*)
        FROM public.profiles AS p
        WHERE p.tenant_id = ctx.tenant_id
          AND p.is_active = true
      ),
      'openRequirements', COALESCE((
        SELECT sum(row_count) FROM requirement_status_counts WHERE status = 'open'
      ), 0),
      'submissionsThisWeek', (
        SELECT count(*)
        FROM recent_submissions AS s
        WHERE s.submitted_at >= ctx.now_at - INTERVAL '7 days'
      ),
      'submissionsPrevWeek', (
        SELECT count(*)
        FROM recent_submissions AS s
        WHERE s.submitted_at >= ctx.now_at - INTERVAL '14 days'
          AND s.submitted_at < ctx.now_at - INTERVAL '7 days'
      ),
      'interviewsScheduled', (
        SELECT count(*)
        FROM public.interviews AS i
        WHERE i.tenant_id = ctx.tenant_id
          AND i.outcome = 'scheduled'::public.interview_outcome
      ),
      'activeConsultants', (
        SELECT count(*)
        FROM bench_source AS b
        WHERE b.status = 'active'::public.candidate_status
      ),
      'benchReady', (
        SELECT count(*)
        FROM bench_source AS b
        WHERE b.availability IN (
          'immediate'::public.availability_status,
          'two_weeks'::public.availability_status,
          'one_month'::public.availability_status,
          'negotiable'::public.availability_status
        )
      ),
      'activePlacements', (
        SELECT count(*)
        FROM public.placements AS p
        WHERE p.tenant_id = ctx.tenant_id
          AND p.status = 'active'::public.placement_status
      ),
      'hiresThisMonth', (
        SELECT count(*)
        FROM public.submissions AS s
        WHERE s.tenant_id = ctx.tenant_id
          AND s.stage = 'hired'::public.submission_stage
          AND s.updated_at >= ctx.now_at - INTERVAL '30 days'
      )
    ) AS value
    FROM request_context AS ctx
  ),
  trend_days AS (
    SELECT ctx.today - (13 - day_offset) AS day
    FROM request_context AS ctx
    CROSS JOIN generate_series(0, 13) AS offsets(day_offset)
  ),
  trend_counts AS (
    SELECT
      (s.submitted_at AT TIME ZONE 'UTC')::date AS day,
      count(*) AS submissions,
      count(*) FILTER (WHERE s.stage = 'hired'::public.submission_stage) AS hired
    FROM recent_submissions AS s
    CROSS JOIN request_context AS ctx
    WHERE s.submitted_at >= ((ctx.today - 13)::timestamp AT TIME ZONE 'UTC')
      AND s.submitted_at < ((ctx.today + 1)::timestamp AT TIME ZONE 'UTC')
    GROUP BY (s.submitted_at AT TIME ZONE 'UTC')::date
  ),
  trend AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(d.day, 'YYYY-MM-DD'),
          'label',
            (ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[
              extract(month FROM d.day)::integer
            ] || ' ' || extract(day FROM d.day)::integer::text,
          'submissions', COALESCE(c.submissions, 0),
          'hired', COALESCE(c.hired, 0)
        )
        ORDER BY d.day
      ),
      '[]'::jsonb
    ) AS value
    FROM trend_days AS d
    LEFT JOIN trend_counts AS c USING (day)
  ),
  funnel_stages(stage, ordinal) AS (
    VALUES
      ('draft', 1),
      ('submitted', 2),
      ('vendor_review', 3),
      ('client_review', 4),
      ('interview', 5),
      ('offer', 6),
      ('hired', 7),
      ('rejected', 8),
      ('withdrawn', 9)
  ),
  funnel AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('stage', f.stage, 'count', COALESCE(c.row_count, 0))
        ORDER BY f.ordinal
      ),
      '[]'::jsonb
    ) AS value
    FROM funnel_stages AS f
    LEFT JOIN submission_stage_counts AS c USING (stage)
  ),
  recruiter_counts AS (
    SELECT
      s.created_by AS id,
      count(*) AS submissions,
      count(*) FILTER (WHERE s.stage = 'hired'::public.submission_stage) AS hires
    FROM recent_submissions AS s
    WHERE s.created_by IS NOT NULL
    GROUP BY s.created_by
    ORDER BY count(*) DESC, s.created_by
    LIMIT 5
  ),
  recruiters AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', COALESCE(NULLIF(btrim(p.full_name), ''), p.email, 'Unknown'),
          'email', p.email,
          'avatar_url', p.avatar_url,
          'submissions', r.submissions,
          'hires', r.hires
        )
        ORDER BY r.submissions DESC, p.id
      ),
      '[]'::jsonb
    ) AS value
    FROM recruiter_counts AS r
    JOIN public.profiles AS p ON p.id = r.id
    CROSS JOIN request_context AS ctx
    WHERE p.tenant_id = ctx.tenant_id
  ),
  availability_names(name, ordinal) AS (
    VALUES
      ('immediate', 1),
      ('two_weeks', 2),
      ('one_month', 3),
      ('negotiable', 4),
      ('unavailable', 5)
  ),
  bench AS (
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM bench_source),
      'immediate', (
        SELECT count(*)
        FROM bench_source
        WHERE availability = 'immediate'::public.availability_status
      ),
      'by_availability', (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object('name', a.name, 'value', COALESCE(c.row_count, 0))
            ORDER BY a.ordinal
          ),
          '[]'::jsonb
        )
        FROM availability_names AS a
        LEFT JOIN (
          SELECT availability::text AS name, count(*) AS row_count
          FROM bench_source
          GROUP BY availability
        ) AS c USING (name)
      ),
      'by_visa', (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object('name', v.name, 'value', v.row_count)
            ORDER BY v.row_count DESC, v.name
          ),
          '[]'::jsonb
        )
        FROM (
          SELECT btrim(visa_status) AS name, count(*) AS row_count
          FROM bench_source
          WHERE NULLIF(btrim(visa_status), '') IS NOT NULL
          GROUP BY btrim(visa_status)
        ) AS v
      ),
      'top_tech', (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object('name', t.name, 'value', t.row_count)
            ORDER BY t.row_count DESC, t.name
          ),
          '[]'::jsonb
        )
        FROM (
          SELECT btrim(primary_technology) AS name, count(*) AS row_count
          FROM bench_source
          WHERE NULLIF(btrim(primary_technology), '') IS NOT NULL
          GROUP BY btrim(primary_technology)
          ORDER BY count(*) DESC, btrim(primary_technology)
          LIMIT 8
        ) AS t
      )
    ) AS value
  ),
  requirements_breakdown AS (
    SELECT jsonb_build_object(
      'by_status', (
        SELECT jsonb_agg(
          jsonb_build_object('name', expected.name, 'value', COALESCE(actual.row_count, 0))
          ORDER BY expected.ordinal
        )
        FROM (VALUES ('open', 1), ('closed', 2), ('expired', 3)) AS expected(name, ordinal)
        LEFT JOIN requirement_status_counts AS actual ON actual.status = expected.name
      ),
      'by_priority', (
        SELECT jsonb_agg(
          jsonb_build_object('name', expected.name, 'value', COALESCE(actual.row_count, 0))
          ORDER BY expected.ordinal
        )
        FROM (VALUES
          ('low', 1), ('medium', 2), ('high', 3), ('urgent', 4)
        ) AS expected(name, ordinal)
        LEFT JOIN requirement_priority_counts AS actual ON actual.priority = expected.name
      )
    ) AS value
  )
  SELECT jsonb_build_object(
    'kpis', kpis.value,
    'trend', trend.value,
    'funnel', funnel.value,
    'recruiters', recruiters.value,
    'bench', bench.value,
    'requirements', requirements_breakdown.value
  )
  FROM kpis
  CROSS JOIN trend
  CROSS JOIN funnel
  CROSS JOIN recruiters
  CROSS JOIN bench
  CROSS JOIN requirements_breakdown;
$$;

REVOKE ALL ON FUNCTION public.dashboard_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_overview() TO authenticated;

COMMENT ON FUNCTION public.dashboard_overview() IS
  'Returns tenant-scoped dashboard KPI, trend, funnel, recruiter, bench, and requirement aggregates in one RPC.';

COMMIT;
