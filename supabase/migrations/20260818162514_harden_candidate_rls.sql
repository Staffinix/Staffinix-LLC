-- ============================================================================
-- Staffinix Security Hardening
-- Candidate / Resume RLS
-- ============================================================================
--
-- SECURITY MODEL
--
--   auth.uid()
--       ↓
--   profiles.tenant_id
--       ↓
--   candidate.tenant_id
--       ↓
--   ALLOW / DENY
--
-- Platform administrators are handled separately through
-- is_platform_admin(auth.uid()).
--
-- IMPORTANT:
-- Frontend roles are NOT trusted for authorization.
-- Database RLS is the security boundary.
-- ============================================================================


BEGIN;

-- This migration defines resume policies before the later resume-ownership
-- preparation migration runs. Establish the column first so a clean database
-- can apply the full migration chain in timestamp order.
ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE public.resumes AS r
SET tenant_id = c.tenant_id
FROM public.candidates AS c
WHERE r.tenant_id IS NULL AND r.candidate_id = c.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.resumes WHERE tenant_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot harden resume RLS: rows without tenant ownership remain.';
  END IF;
END $$;

ALTER TABLE public.resumes ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS resumes_tenant_id_idx ON public.resumes(tenant_id);


-- ============================================================================
-- 1. Remove the dangerous policies
-- ============================================================================

DROP POLICY IF EXISTS "candidates_all"
ON public.candidates;

DROP POLICY IF EXISTS "candidate_skills_all"
ON public.candidate_skills;

DROP POLICY IF EXISTS "candidate_employment_all"
ON public.candidate_employment;

DROP POLICY IF EXISTS "candidate_education_all"
ON public.candidate_education;

DROP POLICY IF EXISTS "candidate_projects_all"
ON public.candidate_projects;

DROP POLICY IF EXISTS "candidate_certifications_all"
ON public.candidate_certifications;

DROP POLICY IF EXISTS "resumes_all"
ON public.resumes;

DROP POLICY IF EXISTS "resume_versions_all"
ON public.resume_versions;

DROP POLICY IF EXISTS "candidate_embeddings_all"
ON public.candidate_embeddings;


-- ============================================================================
-- 2. Candidates
-- ============================================================================

CREATE POLICY "candidates_select_authorized"
ON public.candidates
FOR SELECT
TO authenticated
USING (
    is_platform_admin(auth.uid())
    OR tenant_id = current_tenant_id()
);


CREATE POLICY "candidates_insert_authorized"
ON public.candidates
FOR INSERT
TO authenticated
WITH CHECK (
    is_platform_admin(auth.uid())
    OR tenant_id = current_tenant_id()
);


CREATE POLICY "candidates_update_authorized"
ON public.candidates
FOR UPDATE
TO authenticated
USING (
    is_platform_admin(auth.uid())
    OR tenant_id = current_tenant_id()
)
WITH CHECK (
    is_platform_admin(auth.uid())
    OR tenant_id = current_tenant_id()
);


CREATE POLICY "candidates_delete_authorized"
ON public.candidates
FOR DELETE
TO authenticated
USING (
    is_platform_admin(auth.uid())
    OR (
        tenant_id = current_tenant_id()
        AND is_admin(auth.uid())
    )
);


-- ============================================================================
-- 3. Candidate skills
-- ============================================================================

CREATE POLICY "candidate_skills_select_authorized"
ON public.candidate_skills
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_skills.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_skills_insert_authorized"
ON public.candidate_skills
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_skills.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_skills_update_authorized"
ON public.candidate_skills
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_skills.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_skills.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_skills_delete_authorized"
ON public.candidate_skills
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_skills.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR (
                  c.tenant_id = current_tenant_id()
                  AND is_admin(auth.uid())
              )
          )
    )
);


-- ============================================================================
-- 4. Candidate employment
-- ============================================================================

CREATE POLICY "candidate_employment_select_authorized"
ON public.candidate_employment
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_employment.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_employment_insert_authorized"
ON public.candidate_employment
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_employment.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_employment_update_authorized"
ON public.candidate_employment
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_employment.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_employment.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_employment_delete_authorized"
ON public.candidate_employment
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_employment.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR (
                  c.tenant_id = current_tenant_id()
                  AND is_admin(auth.uid())
              )
          )
    )
);


-- ============================================================================
-- 5. Candidate education
-- ============================================================================

CREATE POLICY "candidate_education_select_authorized"
ON public.candidate_education
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_education.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_education_insert_authorized"
ON public.candidate_education
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_education.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_education_update_authorized"
ON public.candidate_education
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_education.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_education.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_education_delete_authorized"
ON public.candidate_education
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_education.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR (
                  c.tenant_id = current_tenant_id()
                  AND is_admin(auth.uid())
              )
          )
    )
);


-- ============================================================================
-- 6. Candidate projects
-- ============================================================================

CREATE POLICY "candidate_projects_select_authorized"
ON public.candidate_projects
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_projects.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_projects_insert_authorized"
ON public.candidate_projects
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_projects.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_projects_update_authorized"
ON public.candidate_projects
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_projects.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_projects.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_projects_delete_authorized"
ON public.candidate_projects
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_projects.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR (
                  c.tenant_id = current_tenant_id()
                  AND is_admin(auth.uid())
              )
          )
    )
);


-- ============================================================================
-- 7. Candidate certifications
-- ============================================================================

CREATE POLICY "candidate_certifications_select_authorized"
ON public.candidate_certifications
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_certifications.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_certifications_insert_authorized"
ON public.candidate_certifications
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_certifications.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_certifications_update_authorized"
ON public.candidate_certifications
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_certifications.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_certifications.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_certifications_delete_authorized"
ON public.candidate_certifications
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = candidate_certifications.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR (
                  c.tenant_id = current_tenant_id()
                  AND is_admin(auth.uid())
              )
          )
    )
);


-- ============================================================================
-- 8. Resumes
-- ============================================================================
--
-- The schema contains tenant_id directly on resumes, so we don't need
-- to traverse through candidates for basic tenant isolation.
-- ============================================================================

CREATE POLICY "resumes_select_authorized"
ON public.resumes
FOR SELECT
TO authenticated
USING (
    is_platform_admin(auth.uid())
    OR tenant_id = current_tenant_id()
);


CREATE POLICY "resumes_insert_authorized"
ON public.resumes
FOR INSERT
TO authenticated
WITH CHECK (
    is_platform_admin(auth.uid())
    OR tenant_id = current_tenant_id()
);


CREATE POLICY "resumes_update_authorized"
ON public.resumes
FOR UPDATE
TO authenticated
USING (
    is_platform_admin(auth.uid())
    OR tenant_id = current_tenant_id()
)
WITH CHECK (
    is_platform_admin(auth.uid())
    OR tenant_id = current_tenant_id()
);


CREATE POLICY "resumes_delete_authorized"
ON public.resumes
FOR DELETE
TO authenticated
USING (
    is_platform_admin(auth.uid())
    OR (
        tenant_id = current_tenant_id()
        AND is_admin(auth.uid())
    )
);


-- ============================================================================
-- 9. Resume versions
-- ============================================================================
--
-- resume_versions contains candidate_id rather than tenant_id.
-- Authorization therefore follows the candidate.
-- ============================================================================

CREATE POLICY "resume_versions_select_authorized"
ON public.resume_versions
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = resume_versions.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "resume_versions_insert_authorized"
ON public.resume_versions
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = resume_versions.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "resume_versions_update_authorized"
ON public.resume_versions
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = resume_versions.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = resume_versions.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR c.tenant_id = current_tenant_id()
          )
    )
);


CREATE POLICY "resume_versions_delete_authorized"
ON public.resume_versions
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates AS c
        WHERE c.id = resume_versions.candidate_id
          AND (
              is_platform_admin(auth.uid())
              OR (
                  c.tenant_id = current_tenant_id()
                  AND is_admin(auth.uid())
              )
          )
    )
);


COMMIT;
