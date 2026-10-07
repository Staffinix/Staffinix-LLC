BEGIN;

-- Return the platform console in one bounded request. The function executes as
-- the caller so existing RLS remains authoritative, and the request context
-- ensures only active platform owners/admins receive data.
CREATE OR REPLACE FUNCTION public.platform_console_overview()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH
  request_context AS MATERIALIZED (
    SELECT true AS allowed
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND (SELECT private.is_platform_admin())
  ),
  active_users AS MATERIALIZED (
    SELECT p.tenant_id, count(*)::integer AS row_count
    FROM public.profiles AS p
    CROSS JOIN request_context
    WHERE p.tenant_id IS NOT NULL
      AND p.is_active = true
    GROUP BY p.tenant_id
  ),
  active_requirements AS MATERIALIZED (
    SELECT r.tenant_id, count(*)::integer AS row_count
    FROM public.requirements AS r
    CROSS JOIN request_context
    WHERE r.status = 'open'::public.requirement_status
    GROUP BY r.tenant_id
  ),
  bench_candidates AS MATERIALIZED (
    SELECT c.tenant_id, count(*)::integer AS row_count
    FROM public.candidates AS c
    CROSS JOIN request_context
    WHERE c.status IN (
      'active'::public.candidate_status,
      'on_hold'::public.candidate_status
    )
    GROUP BY c.tenant_id
  ),
  tenant_rows AS MATERIALIZED (
    SELECT
      t.id,
      t.name,
      t.slug,
      t.plan,
      t.status,
      t.seat_limit,
      t.industry,
      t.website,
      t.primary_contact_email,
      t.tax_id,
      t.company_address,
      t.owner_contact_name,
      t.owner_contact_email,
      t.owner_contact_phone,
      t.admin_contact_name,
      t.admin_contact_email,
      t.admin_contact_phone,
      t.created_at,
      COALESCE(u.row_count, 0) AS users,
      COALESCE(r.row_count, 0) AS requirements,
      COALESCE(c.row_count, 0) AS candidates
    FROM public.tenants AS t
    CROSS JOIN request_context
    LEFT JOIN active_users AS u ON u.tenant_id = t.id
    LEFT JOIN active_requirements AS r ON r.tenant_id = t.id
    LEFT JOIN bench_candidates AS c ON c.tenant_id = t.id
  )
  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'tenants', count(*),
      'users', COALESCE(sum(tr.users), 0),
      'requirements', COALESCE(sum(tr.requirements), 0),
      'candidates', COALESCE(sum(tr.candidates), 0)
    ),
    'tenants', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', tr.id,
          'name', tr.name,
          'slug', tr.slug,
          'plan', tr.plan,
          'status', tr.status,
          'seat_limit', tr.seat_limit,
          'industry', tr.industry,
          'website', tr.website,
          'primary_contact_email', tr.primary_contact_email,
          'tax_id', tr.tax_id,
          'company_address', tr.company_address,
          'owner_contact_name', tr.owner_contact_name,
          'owner_contact_email', tr.owner_contact_email,
          'owner_contact_phone', tr.owner_contact_phone,
          'admin_contact_name', tr.admin_contact_name,
          'admin_contact_email', tr.admin_contact_email,
          'admin_contact_phone', tr.admin_contact_phone,
          'created_at', tr.created_at,
          'stats', jsonb_build_object(
            'users', tr.users,
            'requirements', tr.requirements,
            'candidates', tr.candidates
          )
        )
        ORDER BY tr.created_at DESC
      ),
      '[]'::jsonb
    )
  )
  FROM tenant_rows AS tr;
$$;

REVOKE ALL ON FUNCTION public.platform_console_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_console_overview() TO authenticated;

COMMENT ON FUNCTION public.platform_console_overview() IS
  'Platform-admin tenant summary with active users, open requirements, and bench candidates.';

COMMIT;
