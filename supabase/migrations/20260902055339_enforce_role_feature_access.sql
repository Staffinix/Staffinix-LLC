BEGIN;

-- Authoritative role-to-feature check for browser/Data API requests. The
-- application repeats this policy for navigation and server functions, while
-- RLS remains the final enforcement boundary.
CREATE OR REPLACE FUNCTION private.can_access_feature(requested_feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active = true
      AND (
        EXISTS (
          SELECT 1
          FROM public.user_roles AS ur
          WHERE ur.user_id = p.id
            AND CASE requested_feature
              WHEN 'dashboard' THEN ur.role::text = ANY (ARRAY[
                'super_admin','admin','recruiter','account_manager',
                'delivery_manager','marketing_executive'
              ])
              WHEN 'audit' THEN ur.role::text = ANY (ARRAY['super_admin','admin'])
              WHEN 'users' THEN ur.role::text = ANY (ARRAY['super_admin','admin'])
              WHEN 'developer' THEN ur.role::text = 'developer_admin'
              WHEN 'candidates' THEN ur.role::text = ANY (ARRAY[
                'super_admin','admin','recruiter','delivery_manager','marketing_executive'
              ])
              WHEN 'requirements' THEN ur.role::text = ANY (ARRAY[
                'super_admin','admin','recruiter','account_manager','delivery_manager'
              ])
              WHEN 'matching' THEN ur.role::text = ANY (ARRAY[
                'super_admin','admin','recruiter','delivery_manager','marketing_executive'
              ])
              WHEN 'tailoring' THEN ur.role::text = ANY (ARRAY[
                'super_admin','admin','recruiter','marketing_executive'
              ])
              WHEN 'submissions' THEN ur.role::text = ANY (ARRAY[
                'super_admin','admin','recruiter','account_manager',
                'delivery_manager','marketing_executive'
              ])
              WHEN 'interviews' THEN ur.role::text = ANY (ARRAY[
                'super_admin','admin','recruiter','account_manager','delivery_manager'
              ])
              WHEN 'clients' THEN ur.role::text = ANY (ARRAY[
                'super_admin','admin','account_manager','marketing_executive'
              ])
              WHEN 'vendors' THEN ur.role::text = ANY (ARRAY[
                'super_admin','admin','recruiter','account_manager','delivery_manager'
              ])
              WHEN 'placements' THEN ur.role::text = ANY (ARRAY[
                'super_admin','admin','account_manager','delivery_manager'
              ])
              WHEN 'recruiters' THEN ur.role::text = ANY (ARRAY[
                'super_admin','admin','delivery_manager'
              ])
              ELSE false
            END
        )
        OR EXISTS (
          SELECT 1
          FROM public.platform_admins AS pa
          WHERE pa.user_id = p.id
            AND CASE requested_feature
              WHEN 'platform' THEN pa.role::text = ANY (ARRAY['platform_owner','platform_admin'])
              WHEN 'dashboard' THEN pa.role::text = ANY (ARRAY['platform_owner','platform_admin'])
              WHEN 'audit' THEN pa.role::text = ANY (ARRAY['platform_owner','platform_admin'])
              WHEN 'developer' THEN pa.role::text = ANY (
                ARRAY['platform_owner','platform_admin','platform_support']
              )
              ELSE false
            END
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION private.can_access_feature(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_feature(text) TO authenticated, service_role;

-- Restrictive policies supplement the existing tenant and ownership policies.
-- Related data dependencies are deliberately included (for example, matching
-- needs both requirement and candidate rows) so an allowed workflow remains
-- functional without opening those pages in the UI.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT * FROM (VALUES
      ('candidates', '(SELECT private.can_access_feature(''candidates'')) OR (SELECT private.can_access_feature(''submissions''))'),
      ('candidate_skills', '(SELECT private.can_access_feature(''candidates'')) OR (SELECT private.can_access_feature(''submissions''))'),
      ('candidate_employment', '(SELECT private.can_access_feature(''candidates'')) OR (SELECT private.can_access_feature(''submissions''))'),
      ('candidate_education', '(SELECT private.can_access_feature(''candidates'')) OR (SELECT private.can_access_feature(''submissions''))'),
      ('candidate_projects', '(SELECT private.can_access_feature(''candidates'')) OR (SELECT private.can_access_feature(''submissions''))'),
      ('candidate_certifications', '(SELECT private.can_access_feature(''candidates'')) OR (SELECT private.can_access_feature(''submissions''))'),
      ('resumes', '(SELECT private.can_access_feature(''candidates'')) OR (SELECT private.can_access_feature(''tailoring'')) OR (SELECT private.can_access_feature(''submissions''))'),
      ('resume_versions', '(SELECT private.can_access_feature(''candidates'')) OR (SELECT private.can_access_feature(''tailoring'')) OR (SELECT private.can_access_feature(''submissions''))'),
      ('candidate_embeddings', '(SELECT private.can_access_feature(''matching''))'),
      ('requirements', '(SELECT private.can_access_feature(''requirements'')) OR (SELECT private.can_access_feature(''matching'')) OR (SELECT private.can_access_feature(''submissions''))'),
      ('requirement_skills', '(SELECT private.can_access_feature(''requirements'')) OR (SELECT private.can_access_feature(''matching'')) OR (SELECT private.can_access_feature(''submissions''))'),
      ('requirement_embeddings', '(SELECT private.can_access_feature(''matching''))'),
      ('clients', '(SELECT private.can_access_feature(''clients'')) OR (SELECT private.can_access_feature(''requirements''))'),
      ('vendors', '(SELECT private.can_access_feature(''vendors'')) OR (SELECT private.can_access_feature(''requirements'')) OR (SELECT private.can_access_feature(''submissions''))'),
      ('submissions', '(SELECT private.can_access_feature(''submissions''))'),
      ('submission_events', '(SELECT private.can_access_feature(''submissions''))'),
      ('interviews', '(SELECT private.can_access_feature(''interviews''))'),
      ('placements', '(SELECT private.can_access_feature(''placements''))'),
      ('audit_logs', '(SELECT private.can_access_feature(''audit''))'),
      ('api_keys', '(SELECT private.can_access_feature(''developer''))'),
      ('workflow_settings', '(SELECT private.can_access_feature(''developer''))')
    ) AS feature_policies(table_name, feature_expression)
  LOOP
    IF to_regclass(format('public.%I', policy_row.table_name)) IS NOT NULL THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS role_feature_access ON public.%I',
        policy_row.table_name
      );
      EXECUTE format(
        'CREATE POLICY role_feature_access ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
        policy_row.table_name,
        policy_row.feature_expression,
        policy_row.feature_expression
      );
    END IF;
  END LOOP;
END;
$$;

-- Developer admins require a permissive tenant-scoped policy in addition to
-- the restrictive feature policy. Existing admin policies remain but are
-- filtered by role_feature_access.
DROP POLICY IF EXISTS api_keys_developer_manage ON public.api_keys;
CREATE POLICY api_keys_developer_manage ON public.api_keys
FOR ALL TO authenticated
USING (
  tenant_id = (SELECT private.current_tenant_id())
  AND (SELECT private.can_access_feature('developer'))
)
WITH CHECK (
  tenant_id = (SELECT private.current_tenant_id())
  AND (SELECT private.can_access_feature('developer'))
);

DROP POLICY IF EXISTS workflow_settings_developer_manage ON public.workflow_settings;
CREATE POLICY workflow_settings_developer_manage ON public.workflow_settings
FOR ALL TO authenticated
USING (
  tenant_id = (SELECT private.current_tenant_id())
  AND (SELECT private.can_access_feature('developer'))
)
WITH CHECK (
  tenant_id = (SELECT private.current_tenant_id())
  AND (SELECT private.can_access_feature('developer'))
);

COMMIT;
