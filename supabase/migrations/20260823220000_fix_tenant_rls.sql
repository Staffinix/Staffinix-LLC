-- ============================================================================
-- Staffinix
-- Tenant Isolation + RLS Hardening
-- Migration: 20260823220000_fix_tenant_rls.sql
--
-- IMPORTANT:
--   This migration assumes:
--     public.profiles(id, tenant_id)
--     public.tenants(id)
--     public.user_roles(user_id, role)
--     public.platform_admins(user_id, role)
--
--   DO NOT use the service_role key in the browser.
--
--   This migration intentionally fails if existing candidate rows cannot be
--   assigned to a tenant. Do not silently create NULL tenant ownership.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. SECURITY SCHEMA / HELPER FUNCTIONS
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

-- ----------------------------------------------------------------------------
-- Current user's tenant
-- ----------------------------------------------------------------------------

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

REVOKE ALL ON FUNCTION private.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_tenant_id()
TO authenticated;

-- ----------------------------------------------------------------------------
-- Current user's role
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.has_role(
    requested_role text
)
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
          AND lower(ur.role::text) = lower(requested_role)
    );
$$;

REVOKE ALL ON FUNCTION private.has_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(text)
TO authenticated;

-- ----------------------------------------------------------------------------
-- Platform role
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.has_platform_role(
    requested_role text
)
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
          AND lower(pa.role::text) = lower(requested_role)
    );
$$;

REVOKE ALL ON FUNCTION private.has_platform_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_platform_role(text)
TO authenticated;

-- ----------------------------------------------------------------------------
-- Application administrator
-- ----------------------------------------------------------------------------

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
          AND lower(ur.role::text) IN ('admin', 'super_admin')
    )
    OR EXISTS (
        SELECT 1
        FROM public.platform_admins AS pa
        WHERE pa.user_id = (SELECT auth.uid())
          AND lower(pa.role::text) IN (
              'platform_owner',
              'platform_admin'
          )
    );
$$;

REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_admin()
TO authenticated;

-- ----------------------------------------------------------------------------
-- Platform owner
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.is_platform_owner()
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
          AND lower(pa.role::text) = 'platform_owner'
    );
$$;

REVOKE ALL ON FUNCTION private.is_platform_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_platform_owner()
TO authenticated;


-- ============================================================================
-- 2. CANDIDATES: ADD TENANT OWNERSHIP
-- ============================================================================

ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE public.candidates
DROP CONSTRAINT IF EXISTS candidates_tenant_id_fkey;

ALTER TABLE public.candidates
ADD CONSTRAINT candidates_tenant_id_fkey
FOREIGN KEY (tenant_id)
REFERENCES public.tenants(id)
ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS candidates_tenant_id_idx
ON public.candidates(tenant_id);


-- ============================================================================
-- 3. BACKFILL EXISTING CANDIDATES
--
-- We only use an unambiguous source:
--
--     candidates.created_by -> profiles.id -> profiles.tenant_id
--
-- If a candidate cannot be mapped safely, the migration stops.
-- ============================================================================

UPDATE public.candidates AS c
SET tenant_id = p.tenant_id
FROM public.profiles AS p
WHERE c.tenant_id IS NULL
  AND c.created_by = p.id
  AND p.tenant_id IS NOT NULL;


DO $$
DECLARE
    unresolved_count bigint;
BEGIN
    SELECT count(*)
    INTO unresolved_count
    FROM public.candidates
    WHERE tenant_id IS NULL;

    IF unresolved_count > 0 THEN
        RAISE EXCEPTION
            'RLS migration stopped: % candidate rows have no tenant_id. Assign these rows to a valid tenant before continuing.',
            unresolved_count;
    END IF;
END
$$;


ALTER TABLE public.candidates
ALTER COLUMN tenant_id SET NOT NULL;


-- ============================================================================
-- 4. CANDIDATES RLS
-- ============================================================================

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "candidates_read_all_auth"
ON public.candidates;

DROP POLICY IF EXISTS "candidates_insert_auth"
ON public.candidates;

DROP POLICY IF EXISTS "candidates_update_own_or_admin"
ON public.candidates;

DROP POLICY IF EXISTS "candidates_delete_admin"
ON public.candidates;

DROP POLICY IF EXISTS "candidates_select_same_tenant"
ON public.candidates;

DROP POLICY IF EXISTS "candidates_insert_same_tenant"
ON public.candidates;

DROP POLICY IF EXISTS "candidates_update_same_tenant"
ON public.candidates;

DROP POLICY IF EXISTS "candidates_delete_same_tenant"
ON public.candidates;


CREATE POLICY "candidates_select_same_tenant"
ON public.candidates
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
    tenant_id = (SELECT private.current_tenant_id())
);


CREATE POLICY "candidates_insert_same_tenant"
ON public.candidates
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
    tenant_id = (SELECT private.current_tenant_id())
    AND created_by = (SELECT auth.uid())
);


CREATE POLICY "candidates_update_same_tenant"
ON public.candidates
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
    tenant_id = (SELECT private.current_tenant_id())
    AND (
        created_by = (SELECT auth.uid())
        OR assigned_to = (SELECT auth.uid())
        OR (SELECT private.is_admin())
    )
)
WITH CHECK (
    tenant_id = (SELECT private.current_tenant_id())
    AND (
        created_by = (SELECT auth.uid())
        OR assigned_to = (SELECT auth.uid())
        OR (SELECT private.is_admin())
    )
);


CREATE POLICY "candidates_delete_same_tenant"
ON public.candidates
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
    tenant_id = (SELECT private.current_tenant_id())
    AND (SELECT private.is_admin())
);


-- ============================================================================
-- 5. CANDIDATE CHILD TABLES
--
-- These tables inherit tenant ownership through candidates.candidate_id.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- candidate_skills
-- ----------------------------------------------------------------------------

ALTER TABLE public.candidate_skills
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_skills
FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cskills_read"
ON public.candidate_skills;

DROP POLICY IF EXISTS "cskills_write"
ON public.candidate_skills;

DROP POLICY IF EXISTS "candidate_skills_select_same_tenant"
ON public.candidate_skills;

DROP POLICY IF EXISTS "candidate_skills_write_same_tenant"
ON public.candidate_skills;


CREATE POLICY "candidate_skills_select_same_tenant"
ON public.candidate_skills
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_skills.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
    )
);


CREATE POLICY "candidate_skills_write_same_tenant"
ON public.candidate_skills
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_skills.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
          AND (
              c.created_by = (SELECT auth.uid())
              OR c.assigned_to = (SELECT auth.uid())
              OR (SELECT private.is_admin())
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_skills.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
          AND (
              c.created_by = (SELECT auth.uid())
              OR c.assigned_to = (SELECT auth.uid())
              OR (SELECT private.is_admin())
          )
    )
);


-- ----------------------------------------------------------------------------
-- candidate_employment
-- ----------------------------------------------------------------------------

ALTER TABLE public.candidate_employment
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_employment
FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cemp_read"
ON public.candidate_employment;

DROP POLICY IF EXISTS "cemp_write"
ON public.candidate_employment;

DROP POLICY IF EXISTS "candidate_employment_select_same_tenant"
ON public.candidate_employment;

DROP POLICY IF EXISTS "candidate_employment_write_same_tenant"
ON public.candidate_employment;


CREATE POLICY "candidate_employment_select_same_tenant"
ON public.candidate_employment
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_employment.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
    )
);


CREATE POLICY "candidate_employment_write_same_tenant"
ON public.candidate_employment
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_employment.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
          AND (
              c.created_by = (SELECT auth.uid())
              OR c.assigned_to = (SELECT auth.uid())
              OR (SELECT private.is_admin())
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_employment.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
          AND (
              c.created_by = (SELECT auth.uid())
              OR c.assigned_to = (SELECT auth.uid())
              OR (SELECT private.is_admin())
          )
    )
);


-- ----------------------------------------------------------------------------
-- candidate_education
-- ----------------------------------------------------------------------------

ALTER TABLE public.candidate_education
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_education
FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cedu_read"
ON public.candidate_education;

DROP POLICY IF EXISTS "cedu_write"
ON public.candidate_education;

DROP POLICY IF EXISTS "candidate_education_select_same_tenant"
ON public.candidate_education;

DROP POLICY IF EXISTS "candidate_education_write_same_tenant"
ON public.candidate_education;


CREATE POLICY "candidate_education_select_same_tenant"
ON public.candidate_education
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_education.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
    )
);


CREATE POLICY "candidate_education_write_same_tenant"
ON public.candidate_education
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_education.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
          AND (
              c.created_by = (SELECT auth.uid())
              OR c.assigned_to = (SELECT auth.uid())
              OR (SELECT private.is_admin())
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_education.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
          AND (
              c.created_by = (SELECT auth.uid())
              OR c.assigned_to = (SELECT auth.uid())
              OR (SELECT private.is_admin())
          )
    )
);


-- ----------------------------------------------------------------------------
-- candidate_projects
-- ----------------------------------------------------------------------------

ALTER TABLE public.candidate_projects
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_projects
FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cproj_read"
ON public.candidate_projects;

DROP POLICY IF EXISTS "cproj_write"
ON public.candidate_projects;

DROP POLICY IF EXISTS "candidate_projects_select_same_tenant"
ON public.candidate_projects;

DROP POLICY IF EXISTS "candidate_projects_write_same_tenant"
ON public.candidate_projects;


CREATE POLICY "candidate_projects_select_same_tenant"
ON public.candidate_projects
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_projects.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
    )
);


CREATE POLICY "candidate_projects_write_same_tenant"
ON public.candidate_projects
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_projects.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
          AND (
              c.created_by = (SELECT auth.uid())
              OR c.assigned_to = (SELECT auth.uid())
              OR (SELECT private.is_admin())
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_projects.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
          AND (
              c.created_by = (SELECT auth.uid())
              OR c.assigned_to = (SELECT auth.uid())
              OR (SELECT private.is_admin())
          )
    )
);


-- ----------------------------------------------------------------------------
-- candidate_certifications
-- ----------------------------------------------------------------------------

ALTER TABLE public.candidate_certifications
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_certifications
FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ccert_read"
ON public.candidate_certifications;

DROP POLICY IF EXISTS "ccert_write"
ON public.candidate_certifications;

DROP POLICY IF EXISTS "candidate_certifications_select_same_tenant"
ON public.candidate_certifications;

DROP POLICY IF EXISTS "candidate_certifications_write_same_tenant"
ON public.candidate_certifications;


CREATE POLICY "candidate_certifications_select_same_tenant"
ON public.candidate_certifications
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_certifications.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
    )
);


CREATE POLICY "candidate_certifications_write_same_tenant"
ON public.candidate_certifications
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_certifications.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
          AND (
              c.created_by = (SELECT auth.uid())
              OR c.assigned_to = (SELECT auth.uid())
              OR (SELECT private.is_admin())
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_certifications.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
          AND (
              c.created_by = (SELECT auth.uid())
              OR c.assigned_to = (SELECT auth.uid())
              OR (SELECT private.is_admin())
          )
    )
);


-- ============================================================================
-- 6. RESUMES
-- ============================================================================

ALTER TABLE public.resumes
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.resumes
FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resumes_read"
ON public.resumes;

DROP POLICY IF EXISTS "resumes_write"
ON public.resumes;

DROP POLICY IF EXISTS "resumes_select_same_tenant"
ON public.resumes;

DROP POLICY IF EXISTS "resumes_write_same_tenant"
ON public.resumes;


CREATE POLICY "resumes_select_same_tenant"
ON public.resumes
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = resumes.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
    )
);


CREATE POLICY "resumes_write_same_tenant"
ON public.resumes
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = resumes.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
          AND (
              c.created_by = (SELECT auth.uid())
              OR c.assigned_to = (SELECT auth.uid())
              OR (SELECT private.is_admin())
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = resumes.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
          AND (
              c.created_by = (SELECT auth.uid())
              OR c.assigned_to = (SELECT auth.uid())
              OR (SELECT private.is_admin())
          )
    )
);


-- ============================================================================
-- 7. RESUME VERSIONS
-- ============================================================================

ALTER TABLE public.resume_versions
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.resume_versions
FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rv_read"
ON public.resume_versions;

DROP POLICY IF EXISTS "rv_write"
ON public.resume_versions;

DROP POLICY IF EXISTS "resume_versions_select_same_tenant"
ON public.resume_versions;

DROP POLICY IF EXISTS "resume_versions_write_same_tenant"
ON public.resume_versions;


CREATE POLICY "resume_versions_select_same_tenant"
ON public.resume_versions
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = resume_versions.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
    )
);


CREATE POLICY "resume_versions_write_same_tenant"
ON public.resume_versions
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = resume_versions.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
          AND (
              c.created_by = (SELECT auth.uid())
              OR c.assigned_to = (SELECT auth.uid())
              OR (SELECT private.is_admin())
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = resume_versions.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
          AND (
              c.created_by = (SELECT auth.uid())
              OR c.assigned_to = (SELECT auth.uid())
              OR (SELECT private.is_admin())
          )
    )
);


-- ============================================================================
-- 8. CANDIDATE EMBEDDINGS
-- ============================================================================

ALTER TABLE public.candidate_embeddings
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_embeddings
FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cemb_read"
ON public.candidate_embeddings;

DROP POLICY IF EXISTS "candidate_embeddings_select_same_tenant"
ON public.candidate_embeddings;


CREATE POLICY "candidate_embeddings_select_same_tenant"
ON public.candidate_embeddings
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_embeddings.candidate_id
          AND c.tenant_id = (SELECT private.current_tenant_id())
    )
);


-- ============================================================================
-- 9. REQUIREMENT EMBEDDINGS
--
-- requirements already has its own tenant/security model in the existing
-- migrations. Do not make this table globally readable.
-- ============================================================================

ALTER TABLE public.requirement_embeddings
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.requirement_embeddings
FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "remb_read"
ON public.requirement_embeddings;

DROP POLICY IF EXISTS "requirement_embeddings_select_same_tenant"
ON public.requirement_embeddings;


CREATE POLICY "requirement_embeddings_select_same_tenant"
ON public.requirement_embeddings
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.requirements AS r
        WHERE r.id = requirement_embeddings.requirement_id
          AND r.tenant_id = (SELECT private.current_tenant_id())
    )
);


-- ============================================================================
-- 10. GRANTS
--
-- RLS controls rows.
-- GRANTS control whether the role can access the object at all.
-- ============================================================================

REVOKE ALL ON public.candidates
FROM anon;

REVOKE ALL ON public.candidate_skills
FROM anon;

REVOKE ALL ON public.candidate_employment
FROM anon;

REVOKE ALL ON public.candidate_education
FROM anon;

REVOKE ALL ON public.candidate_projects
FROM anon;

REVOKE ALL ON public.candidate_certifications
FROM anon;

REVOKE ALL ON public.resumes
FROM anon;

REVOKE ALL ON public.resume_versions
FROM anon;

REVOKE ALL ON public.candidate_embeddings
FROM anon;

REVOKE ALL ON public.requirement_embeddings
FROM anon;


GRANT SELECT, INSERT, UPDATE, DELETE
ON public.candidates
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.candidate_skills
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.candidate_employment
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.candidate_education
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.candidate_projects
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.candidate_certifications
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.resumes
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.resume_versions
TO authenticated;

GRANT SELECT
ON public.candidate_embeddings
TO authenticated;

GRANT SELECT
ON public.requirement_embeddings
TO authenticated;


-- ============================================================================
-- 11. INDEXES FOR RLS PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS candidates_created_by_idx
ON public.candidates(created_by);

CREATE INDEX IF NOT EXISTS candidates_assigned_to_idx
ON public.candidates(assigned_to);

CREATE INDEX IF NOT EXISTS candidate_skills_candidate_id_idx
ON public.candidate_skills(candidate_id);

CREATE INDEX IF NOT EXISTS candidate_employment_candidate_id_idx
ON public.candidate_employment(candidate_id);

CREATE INDEX IF NOT EXISTS candidate_education_candidate_id_idx
ON public.candidate_education(candidate_id);

CREATE INDEX IF NOT EXISTS candidate_projects_candidate_id_idx
ON public.candidate_projects(candidate_id);

CREATE INDEX IF NOT EXISTS candidate_certifications_candidate_id_idx
ON public.candidate_certifications(candidate_id);

CREATE INDEX IF NOT EXISTS resumes_candidate_id_idx
ON public.resumes(candidate_id);

CREATE INDEX IF NOT EXISTS resume_versions_candidate_id_idx
ON public.resume_versions(candidate_id);

CREATE INDEX IF NOT EXISTS profiles_tenant_id_idx
ON public.profiles(tenant_id);

CREATE INDEX IF NOT EXISTS user_roles_user_id_role_idx
ON public.user_roles(user_id, role);

CREATE INDEX IF NOT EXISTS platform_admins_user_id_role_idx
ON public.platform_admins(user_id, role);


COMMIT;


-- ============================================================================
-- END
-- ============================================================================
