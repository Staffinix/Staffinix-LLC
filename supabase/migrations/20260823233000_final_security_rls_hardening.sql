BEGIN;

-- ============================================================================
-- FINAL SECURITY / RLS HARDENING
-- ============================================================================
-- This migration establishes the final database security state.
-- It deliberately removes legacy policies first so historical permissive
-- policies cannot accidentally widen access later.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

-- ---------------------------------------------------------------------------
-- Fail-closed authorization helpers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.tenant_id
  FROM public.profiles AS p
  WHERE p.id = (SELECT auth.uid())
    AND p.is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.has_role(requested_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role = requested_role
  );
$$;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
  OR EXISTS (
    SELECT 1
    FROM public.platform_admins AS pa
    WHERE pa.user_id = (SELECT auth.uid())
      AND pa.role IN ('platform_owner'::public.platform_role, 'platform_admin'::public.platform_role)
  );
$$;

CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins AS pa
    WHERE pa.user_id = (SELECT auth.uid())
      AND pa.role IN ('platform_owner'::public.platform_role, 'platform_admin'::public.platform_role)
  );
$$;

-- Compatibility wrappers used by application/RLS code.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT private.current_tenant_id(); $$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
  OR EXISTS (
    SELECT 1 FROM public.platform_admins AS pa
    WHERE pa.user_id = _user_id
      AND pa.role IN ('platform_owner'::public.platform_role, 'platform_admin'::public.platform_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins AS pa
    WHERE pa.user_id = _user_id
      AND pa.role IN ('platform_owner'::public.platform_role, 'platform_admin'::public.platform_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = _user_id AND ur.role = _role
  );
$$;

REVOKE ALL ON FUNCTION private.current_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_role(public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- ---------------------------------------------------------------------------
-- Resume ownership must be explicit. The previous migrations referenced a
-- tenant_id column that did not exist on resumes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.resumes DROP CONSTRAINT IF EXISTS resumes_tenant_id_fkey;
ALTER TABLE public.resumes
  ADD CONSTRAINT resumes_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;

UPDATE public.resumes AS r
SET tenant_id = c.tenant_id
FROM public.candidates AS c
WHERE r.tenant_id IS NULL AND c.id = r.candidate_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.resumes WHERE tenant_id IS NULL) THEN
    RAISE EXCEPTION 'Security migration stopped: resume rows without tenant ownership remain.';
  END IF;
END $$;

ALTER TABLE public.resumes ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS resumes_tenant_id_idx ON public.resumes(tenant_id);

-- ---------------------------------------------------------------------------
-- Normalize tenant ownership on core tables. Existing rows are mapped through
-- their trusted parent/creator relationships; unresolved rows abort the
-- migration rather than becoming cross-tenant or NULL-owned data.
-- ---------------------------------------------------------------------------
UPDATE public.clients AS x SET tenant_id = p.tenant_id
FROM public.profiles AS p
WHERE x.tenant_id IS NULL AND x.created_by = p.id AND p.tenant_id IS NOT NULL;

UPDATE public.vendors AS x SET tenant_id = p.tenant_id
FROM public.profiles AS p
WHERE x.tenant_id IS NULL AND x.created_by = p.id AND p.tenant_id IS NOT NULL;

UPDATE public.requirements AS x SET tenant_id = p.tenant_id
FROM public.profiles AS p
WHERE x.tenant_id IS NULL AND x.created_by = p.id AND p.tenant_id IS NOT NULL;

UPDATE public.submissions AS x SET tenant_id = r.tenant_id
FROM public.requirements AS r
WHERE x.tenant_id IS NULL AND x.requirement_id = r.id AND r.tenant_id IS NOT NULL;

UPDATE public.interviews AS x SET tenant_id = s.tenant_id
FROM public.submissions AS s
WHERE x.tenant_id IS NULL AND x.submission_id = s.id AND s.tenant_id IS NOT NULL;

UPDATE public.placements AS x SET tenant_id = s.tenant_id
FROM public.submissions AS s
WHERE x.tenant_id IS NULL AND x.submission_id = s.id AND s.tenant_id IS NOT NULL;

UPDATE public.audit_logs AS x SET tenant_id = p.tenant_id
FROM public.profiles AS p
WHERE x.tenant_id IS NULL AND x.actor_id = p.id AND p.tenant_id IS NOT NULL;

DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','vendors','requirements','submissions','interviews','placements'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS NULL', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'Security migration stopped: % rows in % have no tenant ownership.', n, t;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.clients ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.vendors ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.requirements ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.submissions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.interviews ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.placements ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS clients_tenant_id_idx ON public.clients(tenant_id);
CREATE INDEX IF NOT EXISTS vendors_tenant_id_idx ON public.vendors(tenant_id);
CREATE INDEX IF NOT EXISTS requirements_tenant_id_idx ON public.requirements(tenant_id);
CREATE INDEX IF NOT EXISTS submissions_tenant_id_idx ON public.submissions(tenant_id);
CREATE INDEX IF NOT EXISTS interviews_tenant_id_idx ON public.interviews(tenant_id);
CREATE INDEX IF NOT EXISTS placements_tenant_id_idx ON public.placements(tenant_id);
CREATE INDEX IF NOT EXISTS audit_logs_tenant_id_idx ON public.audit_logs(tenant_id);

-- ---------------------------------------------------------------------------
-- Drop every legacy policy on every application table. This prevents an old
-- permissive policy from widening a newer restrictive policy.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'profiles','user_roles','audit_logs','tenants','platform_admins',
        'api_keys','workflow_settings','clients','vendors','requirements',
        'requirement_skills','candidates','candidate_skills',
        'candidate_employment','candidate_education','candidate_projects',
        'candidate_certifications','resumes','resume_versions',
        'candidate_embeddings','requirement_embeddings','submissions',
        'submission_events','interviews','placements','platform_access_requests'
      ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- RLS is enabled and forced on all sensitive application tables.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','user_roles','audit_logs','tenants','platform_admins',
    'api_keys','workflow_settings','clients','vendors','requirements',
    'requirement_skills','candidates','candidate_skills',
    'candidate_employment','candidate_education','candidate_projects',
    'candidate_certifications','resumes','resume_versions',
    'candidate_embeddings','requirement_embeddings','submissions',
    'submission_events','interviews','placements','platform_access_requests'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Profiles / roles / platform roles.
-- ---------------------------------------------------------------------------
CREATE POLICY profiles_select_self_or_admin ON public.profiles
FOR SELECT TO authenticated
USING (
  id = (SELECT auth.uid())
  OR (SELECT private.is_admin())
);

CREATE POLICY profiles_update_self ON public.profiles
FOR UPDATE TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));

CREATE POLICY profiles_admin_update ON public.profiles
FOR UPDATE TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY user_roles_select_self_or_admin ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));

CREATE POLICY platform_admins_select_self_or_platform ON public.platform_admins
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (SELECT private.is_platform_admin())
);

CREATE POLICY audit_logs_admin_read ON public.audit_logs
FOR SELECT TO authenticated
USING (
  (SELECT private.is_platform_admin())
  OR (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()))
);

-- ---------------------------------------------------------------------------
-- Tenants and platform configuration.
-- ---------------------------------------------------------------------------
CREATE POLICY tenants_select_member_or_platform ON public.tenants
FOR SELECT TO authenticated
USING (id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()));

CREATE POLICY tenants_insert_platform ON public.tenants
FOR INSERT TO authenticated
WITH CHECK ((SELECT private.is_platform_admin()));

CREATE POLICY tenants_update_member_admin ON public.tenants
FOR UPDATE TO authenticated
USING (
  (SELECT private.is_platform_admin())
  OR (id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()))
)
WITH CHECK (
  (SELECT private.is_platform_admin())
  OR id = (SELECT private.current_tenant_id())
);

CREATE POLICY tenants_delete_platform ON public.tenants
FOR DELETE TO authenticated
USING ((SELECT private.is_platform_admin()));

CREATE POLICY api_keys_admin_manage ON public.api_keys
FOR ALL TO authenticated
USING (
  tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin())
)
WITH CHECK (
  tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin())
);

CREATE POLICY workflow_settings_member_read ON public.workflow_settings
FOR SELECT TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()));

CREATE POLICY workflow_settings_admin_manage ON public.workflow_settings
FOR ALL TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()))
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()));

-- ---------------------------------------------------------------------------
-- Core CRM tables.
-- ---------------------------------------------------------------------------
CREATE POLICY clients_select_same_tenant ON public.clients
FOR SELECT TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()));
CREATE POLICY clients_insert_same_tenant ON public.clients
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()) AND created_by = (SELECT auth.uid()));
CREATE POLICY clients_update_admin ON public.clients
FOR UPDATE TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()))
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY clients_delete_admin ON public.clients
FOR DELETE TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()));

CREATE POLICY vendors_select_same_tenant ON public.vendors
FOR SELECT TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()));
CREATE POLICY vendors_insert_same_tenant ON public.vendors
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()) AND created_by = (SELECT auth.uid()));
CREATE POLICY vendors_update_admin ON public.vendors
FOR UPDATE TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()))
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY vendors_delete_admin ON public.vendors
FOR DELETE TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()));

CREATE POLICY requirements_select_same_tenant ON public.requirements
FOR SELECT TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()));
CREATE POLICY requirements_insert_same_tenant ON public.requirements
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()) AND created_by = (SELECT auth.uid()));
CREATE POLICY requirements_update_authorized ON public.requirements
FOR UPDATE TO authenticated
USING (
  tenant_id = (SELECT private.current_tenant_id())
  AND (created_by = (SELECT auth.uid()) OR assigned_to = (SELECT auth.uid()) OR (SELECT private.is_admin()))
)
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY requirements_delete_authorized ON public.requirements
FOR DELETE TO authenticated
USING (
  tenant_id = (SELECT private.current_tenant_id())
  AND (created_by = (SELECT auth.uid()) OR (SELECT private.is_admin()))
);

CREATE POLICY requirement_skills_select_same_tenant ON public.requirement_skills
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.requirements r
  WHERE r.id = requirement_skills.requirement_id
    AND (r.tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()))
));
CREATE POLICY requirement_skills_manage_authorized ON public.requirement_skills
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.requirements r
  WHERE r.id = requirement_skills.requirement_id
    AND r.tenant_id = (SELECT private.current_tenant_id())
    AND (r.created_by = (SELECT auth.uid()) OR r.assigned_to = (SELECT auth.uid()) OR (SELECT private.is_admin()))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.requirements r
  WHERE r.id = requirement_skills.requirement_id
    AND r.tenant_id = (SELECT private.current_tenant_id())
    AND (r.created_by = (SELECT auth.uid()) OR r.assigned_to = (SELECT auth.uid()) OR (SELECT private.is_admin()))
));

-- ---------------------------------------------------------------------------
-- Candidates and all child data.
-- ---------------------------------------------------------------------------
CREATE POLICY candidates_select_same_tenant ON public.candidates
FOR SELECT TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()));
CREATE POLICY candidates_insert_same_tenant ON public.candidates
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()) AND created_by = (SELECT auth.uid()));
CREATE POLICY candidates_update_authorized ON public.candidates
FOR UPDATE TO authenticated
USING (
  tenant_id = (SELECT private.current_tenant_id())
  AND (created_by = (SELECT auth.uid()) OR assigned_to = (SELECT auth.uid()) OR (SELECT private.is_admin()))
)
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY candidates_delete_admin ON public.candidates
FOR DELETE TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['candidate_skills','candidate_employment','candidate_education','candidate_projects','candidate_certifications'] LOOP
    EXECUTE format($sql$
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.candidates c
        WHERE c.id = public.%I.candidate_id
          AND (c.tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()))
      ))
    $sql$, t || '_select_same_tenant', t, t);
    EXECUTE format($sql$
      CREATE POLICY %I ON public.%I FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.candidates c
        WHERE c.id = public.%I.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
          AND (c.created_by = (SELECT auth.uid()) OR c.assigned_to = (SELECT auth.uid()) OR (SELECT private.is_admin()))
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.candidates c
        WHERE c.id = public.%I.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
          AND (c.created_by = (SELECT auth.uid()) OR c.assigned_to = (SELECT auth.uid()) OR (SELECT private.is_admin()))
      ))
    $sql$, t || '_manage_authorized', t, t, t);
  END LOOP;
END $$;

CREATE POLICY resumes_select_same_tenant ON public.resumes
FOR SELECT TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()));
CREATE POLICY resumes_insert_authorized ON public.resumes
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()) AND EXISTS (
  SELECT 1 FROM public.candidates c
  WHERE c.id = resumes.candidate_id
    AND c.tenant_id = (SELECT private.current_tenant_id())
    AND (c.created_by = (SELECT auth.uid()) OR c.assigned_to = (SELECT auth.uid()) OR (SELECT private.is_admin()))
));
CREATE POLICY resumes_update_authorized ON public.resumes
FOR UPDATE TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) AND EXISTS (
  SELECT 1 FROM public.candidates c
  WHERE c.id = resumes.candidate_id
    AND c.tenant_id = (SELECT private.current_tenant_id())
    AND (c.created_by = (SELECT auth.uid()) OR c.assigned_to = (SELECT auth.uid()) OR (SELECT private.is_admin()))
))
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY resumes_delete_admin ON public.resumes
FOR DELETE TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()));

CREATE POLICY resume_versions_select_same_tenant ON public.resume_versions
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.candidates c
  WHERE c.id = resume_versions.candidate_id
    AND (c.tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()))
));
CREATE POLICY resume_versions_manage_authorized ON public.resume_versions
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.candidates c
  WHERE c.id = resume_versions.candidate_id
    AND c.tenant_id = (SELECT private.current_tenant_id())
    AND (c.created_by = (SELECT auth.uid()) OR c.assigned_to = (SELECT auth.uid()) OR (SELECT private.is_admin()))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.candidates c
  WHERE c.id = resume_versions.candidate_id
    AND c.tenant_id = (SELECT private.current_tenant_id())
    AND (c.created_by = (SELECT auth.uid()) OR c.assigned_to = (SELECT auth.uid()) OR (SELECT private.is_admin()))
));

CREATE POLICY candidate_embeddings_select_same_tenant ON public.candidate_embeddings
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.candidates c
  WHERE c.id = candidate_embeddings.candidate_id
    AND (c.tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()))
));

CREATE POLICY requirement_embeddings_select_same_tenant ON public.requirement_embeddings
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.requirements r
  WHERE r.id = requirement_embeddings.requirement_id
    AND (r.tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()))
));

-- ---------------------------------------------------------------------------
-- Pipeline tables. Tenant is checked directly AND through parent links to stop
-- forged cross-tenant foreign keys.
-- ---------------------------------------------------------------------------
CREATE POLICY submissions_select_same_tenant ON public.submissions
FOR SELECT TO authenticated
USING (
  tenant_id = (SELECT private.current_tenant_id())
  AND EXISTS (SELECT 1 FROM public.requirements r WHERE r.id = submissions.requirement_id AND r.tenant_id = tenant_id)
  AND EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = submissions.candidate_id AND c.tenant_id = tenant_id)
);
CREATE POLICY submissions_insert_same_tenant ON public.submissions
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = (SELECT private.current_tenant_id())
  AND created_by = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.requirements r WHERE r.id = submissions.requirement_id AND r.tenant_id = tenant_id)
  AND EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = submissions.candidate_id AND c.tenant_id = tenant_id)
);
CREATE POLICY submissions_update_same_tenant ON public.submissions
FOR UPDATE TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) AND (created_by = (SELECT auth.uid()) OR submitted_by = (SELECT auth.uid()) OR (SELECT private.is_admin())))
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY submissions_delete_admin ON public.submissions
FOR DELETE TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()));

CREATE POLICY submission_events_select_same_tenant ON public.submission_events
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.submissions s
  WHERE s.id = submission_events.submission_id AND s.tenant_id = (SELECT private.current_tenant_id())
));
CREATE POLICY submission_events_insert_same_tenant ON public.submission_events
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.submissions s
  WHERE s.id = submission_events.submission_id AND s.tenant_id = (SELECT private.current_tenant_id())
));

CREATE POLICY interviews_select_same_tenant ON public.interviews
FOR SELECT TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) AND EXISTS (
  SELECT 1 FROM public.submissions s WHERE s.id = interviews.submission_id AND s.tenant_id = tenant_id
));
CREATE POLICY interviews_insert_same_tenant ON public.interviews
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()) AND created_by = (SELECT auth.uid()) AND EXISTS (
  SELECT 1 FROM public.submissions s WHERE s.id = interviews.submission_id AND s.tenant_id = tenant_id
));
CREATE POLICY interviews_update_same_tenant ON public.interviews
FOR UPDATE TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) AND (created_by = (SELECT auth.uid()) OR (SELECT private.is_admin())))
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY interviews_delete_admin ON public.interviews
FOR DELETE TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()));

CREATE POLICY placements_select_same_tenant ON public.placements
FOR SELECT TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) AND EXISTS (
  SELECT 1 FROM public.submissions s WHERE s.id = placements.submission_id AND s.tenant_id = tenant_id
));
CREATE POLICY placements_insert_same_tenant ON public.placements
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()) AND created_by = (SELECT auth.uid()) AND EXISTS (
  SELECT 1 FROM public.submissions s WHERE s.id = placements.submission_id AND s.tenant_id = tenant_id
));
CREATE POLICY placements_update_admin ON public.placements
FOR UPDATE TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()))
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY placements_delete_admin ON public.placements
FOR DELETE TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) AND (SELECT private.is_admin()));

-- ---------------------------------------------------------------------------
-- Platform access requests: users can only create/read their own; platform
-- staff can review. Client-supplied identity is never trusted.
-- ---------------------------------------------------------------------------
CREATE POLICY platform_access_requests_insert_self ON public.platform_access_requests
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY platform_access_requests_select_self_or_platform ON public.platform_access_requests
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR (SELECT private.is_platform_admin()));
CREATE POLICY platform_access_requests_update_platform ON public.platform_access_requests
FOR UPDATE TO authenticated
USING ((SELECT private.is_platform_admin()))
WITH CHECK ((SELECT private.is_platform_admin()));

-- ---------------------------------------------------------------------------
-- Storage: keep the bucket private and require the first path component to be
-- the current tenant. Admins remain tenant-scoped.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS resumes_bucket_read ON storage.objects;
DROP POLICY IF EXISTS resumes_bucket_insert ON storage.objects;
DROP POLICY IF EXISTS resumes_bucket_update ON storage.objects;
DROP POLICY IF EXISTS resumes_bucket_delete ON storage.objects;

CREATE POLICY resumes_bucket_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'resumes'
  AND (
    (storage.foldername(name))[1] = (SELECT private.current_tenant_id())::text
    OR (SELECT private.is_platform_admin())
  )
);

CREATE POLICY resumes_bucket_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'resumes'
  AND (storage.foldername(name))[1] = (SELECT private.current_tenant_id())::text
);

CREATE POLICY resumes_bucket_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'resumes'
  AND (storage.foldername(name))[1] = (SELECT private.current_tenant_id())::text
)
WITH CHECK (
  bucket_id = 'resumes'
  AND (storage.foldername(name))[1] = (SELECT private.current_tenant_id())::text
);

CREATE POLICY resumes_bucket_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'resumes'
  AND (storage.foldername(name))[1] = (SELECT private.current_tenant_id())::text
  AND (SELECT private.is_admin())
);

-- Never expose sensitive application data to anon through the Data API.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','user_roles','audit_logs','tenants','platform_admins','api_keys',
    'workflow_settings','clients','vendors','requirements','requirement_skills',
    'candidates','candidate_skills','candidate_employment','candidate_education',
    'candidate_projects','candidate_certifications','resumes','resume_versions',
    'candidate_embeddings','requirement_embeddings','submissions','submission_events',
    'interviews','placements','platform_access_requests'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- No automatic privilege creation for the first account.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  full_name text;
BEGIN
  full_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, email, full_name, avatar_url, tenant_id)
  VALUES (NEW.id, NEW.email, full_name, NEW.raw_user_meta_data ->> 'avatar_url', NULL)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Secure vector RPCs. SECURITY DEFINER means tenant filtering must be inside
-- the function rather than relying on table RLS.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_candidates_semantic(vector, integer);
CREATE OR REPLACE FUNCTION public.search_candidates_semantic(_query_embedding vector(3072), _limit integer DEFAULT 25)
RETURNS TABLE(candidate_id uuid, similarity real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ce.candidate_id,
         (1 - (ce.embedding::public.halfvec(3072) OPERATOR(public.<=>) _query_embedding::public.halfvec(3072)))::real
  FROM public.candidate_embeddings ce
  JOIN public.candidates c ON c.id = ce.candidate_id
  WHERE c.tenant_id = private.current_tenant_id()
  ORDER BY ce.embedding::public.halfvec(3072) OPERATOR(public.<=>) _query_embedding::public.halfvec(3072)
  LIMIT LEAST(GREATEST(_limit, 1), 50);
$$;

DROP FUNCTION IF EXISTS public.match_candidates_for_requirement(uuid, integer);
CREATE OR REPLACE FUNCTION public.match_candidates_for_requirement(_requirement_id uuid, _limit integer DEFAULT 25)
RETURNS TABLE(candidate_id uuid, similarity real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ce.candidate_id,
         (1 - (ce.embedding::public.halfvec(3072) OPERATOR(public.<=>) re.embedding::public.halfvec(3072)))::real
  FROM public.requirement_embeddings re
  JOIN public.requirements r ON r.id = re.requirement_id
  JOIN public.candidate_embeddings ce ON true
  JOIN public.candidates c ON c.id = ce.candidate_id
  WHERE re.requirement_id = _requirement_id
    AND r.tenant_id = private.current_tenant_id()
    AND c.tenant_id = private.current_tenant_id()
  ORDER BY ce.embedding::public.halfvec(3072) OPERATOR(public.<=>) re.embedding::public.halfvec(3072)
  LIMIT LEAST(GREATEST(_limit, 1), 50);
$$;

DROP FUNCTION IF EXISTS public.match_requirements_for_candidate(uuid, integer);
CREATE OR REPLACE FUNCTION public.match_requirements_for_candidate(_candidate_id uuid, _limit integer DEFAULT 25)
RETURNS TABLE(requirement_id uuid, similarity real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT re.requirement_id,
         (1 - (re.embedding::public.halfvec(3072) OPERATOR(public.<=>) ce.embedding::public.halfvec(3072)))::real
  FROM public.candidate_embeddings ce
  JOIN public.candidates c ON c.id = ce.candidate_id
  JOIN public.requirement_embeddings re ON true
  JOIN public.requirements r ON r.id = re.requirement_id
  WHERE ce.candidate_id = _candidate_id
    AND c.tenant_id = private.current_tenant_id()
    AND r.tenant_id = private.current_tenant_id()
  ORDER BY re.embedding::public.halfvec(3072) OPERATOR(public.<=>) ce.embedding::public.halfvec(3072)
  LIMIT LEAST(GREATEST(_limit, 1), 50);
$$;

REVOKE ALL ON FUNCTION public.search_candidates_semantic(vector, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_candidates_for_requirement(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_requirements_for_candidate(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_candidates_semantic(vector, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_candidates_for_requirement(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_requirements_for_candidate(uuid, integer) TO authenticated;

COMMIT;
