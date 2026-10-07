BEGIN;

-- ============================================================================
-- STAFFINIX SECURITY HARDENING
-- ============================================================================
--
-- Goals:
--
-- 1. Remove legacy permissive RLS policies.
-- 2. Enforce tenant isolation.
-- 3. Protect candidate child tables.
-- 4. Protect embeddings.
-- 5. Protect SECURITY DEFINER semantic-search functions.
-- 6. Stop automatic first-user super_admin/platform_owner creation.
-- 7. Stop automatic assignment of new users to the first tenant.
-- 8. Prevent authenticated users from changing tenant ownership.
--
-- IMPORTANT:
-- This migration does NOT modify historical migrations.
-- It creates the final security state for the current database.
-- ============================================================================


-- ============================================================================
-- 1. SECURITY FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.tenant_id
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
    LIMIT 1;
$$;

REVOKE EXECUTE
ON FUNCTION public.current_tenant_id()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.current_tenant_id()
TO authenticated;


-- ============================================================================
-- 2. PLATFORM ADMIN CHECK
--
-- IMPORTANT:
-- The old implementation treated EVERY row in platform_admins as an admin.
-- This version checks the actual platform role.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.platform_admins AS pa
        WHERE pa.user_id = _user_id
          AND pa.role IN (
              'platform_owner'::public.platform_role,
              'platform_admin'::public.platform_role
          )
    );
$$;

REVOKE EXECUTE
ON FUNCTION public.is_platform_admin(uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.is_platform_admin(uuid)
TO authenticated;


-- ============================================================================
-- 3. ENABLE + FORCE RLS
-- ============================================================================

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates FORCE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_skills FORCE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_employment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_employment FORCE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_education ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_education FORCE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_projects FORCE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_certifications FORCE ROW LEVEL SECURITY;

ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.resume_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_versions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.candidate_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_embeddings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.requirement_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_embeddings FORCE ROW LEVEL SECURITY;


-- ============================================================================
-- 4. REMOVE ALL LEGACY CANDIDATE POLICIES
--
-- This is the part your previous hardening migration missed.
-- ============================================================================

DROP POLICY IF EXISTS "candidates_read_all_auth"
ON public.candidates;

DROP POLICY IF EXISTS "candidates_insert_auth"
ON public.candidates;

DROP POLICY IF EXISTS "candidates_update_own_or_admin"
ON public.candidates;

DROP POLICY IF EXISTS "candidates_delete_admin"
ON public.candidates;

DROP POLICY IF EXISTS "candidates_all"
ON public.candidates;

DROP POLICY IF EXISTS "Tenant isolation"
ON public.candidates;

DROP POLICY IF EXISTS "candidates_select_authorized"
ON public.candidates;

DROP POLICY IF EXISTS "candidates_insert_authorized"
ON public.candidates;

DROP POLICY IF EXISTS "candidates_update_authorized"
ON public.candidates;

DROP POLICY IF EXISTS "candidates_delete_authorized"
ON public.candidates;


-- ============================================================================
-- 5. CANDIDATE POLICIES
-- ============================================================================

CREATE POLICY "candidates_select_authorized"
ON public.candidates
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
    public.is_platform_admin(auth.uid())
    OR tenant_id = public.current_tenant_id()
);


CREATE POLICY "candidates_insert_authorized"
ON public.candidates
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR tenant_id = public.current_tenant_id()
);


CREATE POLICY "candidates_update_authorized"
ON public.candidates
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
    public.is_platform_admin(auth.uid())
    OR tenant_id = public.current_tenant_id()
)
WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR tenant_id = public.current_tenant_id()
);


CREATE POLICY "candidates_delete_authorized"
ON public.candidates
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
    public.is_platform_admin(auth.uid())
    OR (
        tenant_id = public.current_tenant_id()
        AND public.is_admin(auth.uid())
    )
);


-- ============================================================================
-- 6. CHILD TABLE HELPER
-- ============================================================================

-- Candidate skills
DROP POLICY IF EXISTS "cskills_read"
ON public.candidate_skills;

DROP POLICY IF EXISTS "cskills_write"
ON public.candidate_skills;

DROP POLICY IF EXISTS "candidate_skills_all"
ON public.candidate_skills;

DROP POLICY IF EXISTS "candidate_skills_select_authorized"
ON public.candidate_skills;

DROP POLICY IF EXISTS "candidate_skills_insert_authorized"
ON public.candidate_skills;

DROP POLICY IF EXISTS "candidate_skills_update_authorized"
ON public.candidate_skills;

DROP POLICY IF EXISTS "candidate_skills_delete_authorized"
ON public.candidate_skills;


CREATE POLICY "candidate_skills_select_authorized"
ON public.candidate_skills
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_skills.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_skills_insert_authorized"
ON public.candidate_skills
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_skills.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_skills_update_authorized"
ON public.candidate_skills
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_skills.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_skills.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_skills_delete_authorized"
ON public.candidate_skills
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_skills.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR (
                  c.tenant_id = public.current_tenant_id()
                  AND public.is_admin(auth.uid())
              )
          )
    )
);


-- ============================================================================
-- 7. EMPLOYMENT
-- ============================================================================

DROP POLICY IF EXISTS "cemp_read"
ON public.candidate_employment;

DROP POLICY IF EXISTS "cemp_write"
ON public.candidate_employment;

DROP POLICY IF EXISTS "candidate_employment_all"
ON public.candidate_employment;

DROP POLICY IF EXISTS "candidate_employment_select_authorized"
ON public.candidate_employment;

DROP POLICY IF EXISTS "candidate_employment_insert_authorized"
ON public.candidate_employment;

DROP POLICY IF EXISTS "candidate_employment_update_authorized"
ON public.candidate_employment;

DROP POLICY IF EXISTS "candidate_employment_delete_authorized"
ON public.candidate_employment;


CREATE POLICY "candidate_employment_select_authorized"
ON public.candidate_employment
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_employment.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_employment_insert_authorized"
ON public.candidate_employment
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_employment.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_employment_update_authorized"
ON public.candidate_employment
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_employment.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_employment.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_employment_delete_authorized"
ON public.candidate_employment
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_employment.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR (
                  c.tenant_id = public.current_tenant_id()
                  AND public.is_admin(auth.uid())
              )
          )
    )
);


-- ============================================================================
-- 8. EDUCATION
-- ============================================================================

DROP POLICY IF EXISTS "cedu_read"
ON public.candidate_education;

DROP POLICY IF EXISTS "cedu_write"
ON public.candidate_education;

DROP POLICY IF EXISTS "candidate_education_all"
ON public.candidate_education;

DROP POLICY IF EXISTS "candidate_education_select_authorized"
ON public.candidate_education;

DROP POLICY IF EXISTS "candidate_education_insert_authorized"
ON public.candidate_education;

DROP POLICY IF EXISTS "candidate_education_update_authorized"
ON public.candidate_education;

DROP POLICY IF EXISTS "candidate_education_delete_authorized"
ON public.candidate_education;


CREATE POLICY "candidate_education_select_authorized"
ON public.candidate_education
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_education.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_education_insert_authorized"
ON public.candidate_education
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_education.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_education_update_authorized"
ON public.candidate_education
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_education.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_education.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_education_delete_authorized"
ON public.candidate_education
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_education.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR (
                  c.tenant_id = public.current_tenant_id()
                  AND public.is_admin(auth.uid())
              )
          )
    )
);


-- ============================================================================
-- 9. PROJECTS
-- ============================================================================

DROP POLICY IF EXISTS "cproj_read"
ON public.candidate_projects;

DROP POLICY IF EXISTS "cproj_write"
ON public.candidate_projects;

DROP POLICY IF EXISTS "candidate_projects_all"
ON public.candidate_projects;

DROP POLICY IF EXISTS "candidate_projects_select_authorized"
ON public.candidate_projects;

DROP POLICY IF EXISTS "candidate_projects_insert_authorized"
ON public.candidate_projects;

DROP POLICY IF EXISTS "candidate_projects_update_authorized"
ON public.candidate_projects;

DROP POLICY IF EXISTS "candidate_projects_delete_authorized"
ON public.candidate_projects;


CREATE POLICY "candidate_projects_select_authorized"
ON public.candidate_projects
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_projects.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_projects_insert_authorized"
ON public.candidate_projects
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_projects.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_projects_update_authorized"
ON public.candidate_projects
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_projects.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_projects.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_projects_delete_authorized"
ON public.candidate_projects
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_projects.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR (
                  c.tenant_id = public.current_tenant_id()
                  AND public.is_admin(auth.uid())
              )
          )
    )
);


-- ============================================================================
-- 10. CERTIFICATIONS
-- ============================================================================

DROP POLICY IF EXISTS "ccert_read"
ON public.candidate_certifications;

DROP POLICY IF EXISTS "ccert_write"
ON public.candidate_certifications;

DROP POLICY IF EXISTS "candidate_certifications_all"
ON public.candidate_certifications;

DROP POLICY IF EXISTS "candidate_certifications_select_authorized"
ON public.candidate_certifications;

DROP POLICY IF EXISTS "candidate_certifications_insert_authorized"
ON public.candidate_certifications;

DROP POLICY IF EXISTS "candidate_certifications_update_authorized"
ON public.candidate_certifications;

DROP POLICY IF EXISTS "candidate_certifications_delete_authorized"
ON public.candidate_certifications;


CREATE POLICY "candidate_certifications_select_authorized"
ON public.candidate_certifications
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_certifications.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_certifications_insert_authorized"
ON public.candidate_certifications
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_certifications.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_certifications_update_authorized"
ON public.candidate_certifications
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_certifications.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_certifications.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "candidate_certifications_delete_authorized"
ON public.candidate_certifications
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_certifications.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR (
                  c.tenant_id = public.current_tenant_id()
                  AND public.is_admin(auth.uid())
              )
          )
    )
);


-- ============================================================================
-- 11. RESUMES
-- ============================================================================

DROP POLICY IF EXISTS "resumes_read"
ON public.resumes;

DROP POLICY IF EXISTS "resumes_write"
ON public.resumes;

DROP POLICY IF EXISTS "resumes_all"
ON public.resumes;

DROP POLICY IF EXISTS "Tenant isolation"
ON public.resumes;

DROP POLICY IF EXISTS "resumes_select_authorized"
ON public.resumes;

DROP POLICY IF EXISTS "resumes_insert_authorized"
ON public.resumes;

DROP POLICY IF EXISTS "resumes_update_authorized"
ON public.resumes;

DROP POLICY IF EXISTS "resumes_delete_authorized"
ON public.resumes;


CREATE POLICY "resumes_select_authorized"
ON public.resumes
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
    public.is_platform_admin(auth.uid())
    OR tenant_id = public.current_tenant_id()
);


CREATE POLICY "resumes_insert_authorized"
ON public.resumes
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR tenant_id = public.current_tenant_id()
);


CREATE POLICY "resumes_update_authorized"
ON public.resumes
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
    public.is_platform_admin(auth.uid())
    OR tenant_id = public.current_tenant_id()
)
WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR tenant_id = public.current_tenant_id()
);


CREATE POLICY "resumes_delete_authorized"
ON public.resumes
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
    public.is_platform_admin(auth.uid())
    OR (
        tenant_id = public.current_tenant_id()
        AND public.is_admin(auth.uid())
    )
);


-- ============================================================================
-- 12. RESUME VERSIONS
-- ============================================================================

DROP POLICY IF EXISTS "rv_read"
ON public.resume_versions;

DROP POLICY IF EXISTS "rv_write"
ON public.resume_versions;

DROP POLICY IF EXISTS "resume_versions_all"
ON public.resume_versions;

DROP POLICY IF EXISTS "resume_versions_select_authorized"
ON public.resume_versions;

DROP POLICY IF EXISTS "resume_versions_insert_authorized"
ON public.resume_versions;

DROP POLICY IF EXISTS "resume_versions_update_authorized"
ON public.resume_versions;

DROP POLICY IF EXISTS "resume_versions_delete_authorized"
ON public.resume_versions;


CREATE POLICY "resume_versions_select_authorized"
ON public.resume_versions
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = resume_versions.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "resume_versions_insert_authorized"
ON public.resume_versions
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = resume_versions.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "resume_versions_update_authorized"
ON public.resume_versions
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = resume_versions.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = resume_versions.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


CREATE POLICY "resume_versions_delete_authorized"
ON public.resume_versions
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = resume_versions.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR (
                  c.tenant_id = public.current_tenant_id()
                  AND public.is_admin(auth.uid())
              )
          )
    )
);


-- ============================================================================
-- 13. CANDIDATE EMBEDDINGS
-- ============================================================================

DROP POLICY IF EXISTS "cemb_read"
ON public.candidate_embeddings;

DROP POLICY IF EXISTS "candidate_embeddings_all"
ON public.candidate_embeddings;

DROP POLICY IF EXISTS "candidate_embeddings_select_authorized"
ON public.candidate_embeddings;


CREATE POLICY "candidate_embeddings_select_authorized"
ON public.candidate_embeddings
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = candidate_embeddings.candidate_id
          AND (
              public.is_platform_admin(auth.uid())
              OR c.tenant_id = public.current_tenant_id()
          )
    )
);


-- ============================================================================
-- 14. REQUIREMENT EMBEDDINGS
-- ============================================================================

DROP POLICY IF EXISTS "remb_read"
ON public.requirement_embeddings;

DROP POLICY IF EXISTS "requirement_embeddings_select_authorized"
ON public.requirement_embeddings;


CREATE POLICY "requirement_embeddings_select_authorized"
ON public.requirement_embeddings
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.requirements r
        WHERE r.id = requirement_embeddings.requirement_id
          AND (
              public.is_platform_admin(auth.uid())
              OR r.tenant_id = public.current_tenant_id()
          )
    )
);


-- ============================================================================
-- 15. SECURE SEMANTIC SEARCH RPC
--
-- The old SECURITY DEFINER function returned embeddings from ALL tenants.
-- RLS on candidate_embeddings does NOT protect a SECURITY DEFINER query.
-- Therefore tenant filtering must happen INSIDE the function.
-- ============================================================================

DROP FUNCTION IF EXISTS public.search_candidates_semantic(vector, integer);

CREATE OR REPLACE FUNCTION public.search_candidates_semantic(
    _query_embedding vector(3072),
    _limit integer DEFAULT 25
)
RETURNS TABLE (
    candidate_id uuid,
    similarity real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        ce.candidate_id,
        (
            1 -
            (
                ce.embedding::halfvec(3072)
                <=>
                _query_embedding::halfvec(3072)
            )
        )::real AS similarity
    FROM public.candidate_embeddings ce
    INNER JOIN public.candidates c
        ON c.id = ce.candidate_id
    WHERE
        public.is_platform_admin(auth.uid())
        OR c.tenant_id = public.current_tenant_id()
    ORDER BY
        ce.embedding::halfvec(3072)
        <=>
        _query_embedding::halfvec(3072)
    LIMIT LEAST(GREATEST(_limit, 1), 50);
$$;

REVOKE ALL
ON FUNCTION public.search_candidates_semantic(vector, integer)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.search_candidates_semantic(vector, integer)
TO authenticated;


-- ============================================================================
-- 16. SECURE REQUIREMENT/CANDIDATE MATCH RPCs
-- ============================================================================

DROP FUNCTION IF EXISTS public.match_candidates_for_requirement(uuid, integer);

CREATE OR REPLACE FUNCTION public.match_candidates_for_requirement(
    _requirement_id uuid,
    _limit integer DEFAULT 25
)
RETURNS TABLE (
    candidate_id uuid,
    similarity real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        ce.candidate_id,
        (
            1 -
            (
                ce.embedding::halfvec(3072)
                <=>
                re.embedding::halfvec(3072)
            )
        )::real AS similarity
    FROM public.requirement_embeddings re
    INNER JOIN public.candidate_embeddings ce
        ON true
    INNER JOIN public.candidates c
        ON c.id = ce.candidate_id
    INNER JOIN public.requirements r
        ON r.id = re.requirement_id
    WHERE
        re.requirement_id = _requirement_id
        AND (
            public.is_platform_admin(auth.uid())
            OR (
                r.tenant_id = public.current_tenant_id()
                AND c.tenant_id = public.current_tenant_id()
            )
        )
    ORDER BY
        ce.embedding::halfvec(3072)
        <=>
        re.embedding::halfvec(3072)
    LIMIT LEAST(GREATEST(_limit, 1), 50);
$$;

REVOKE ALL
ON FUNCTION public.match_candidates_for_requirement(uuid, integer)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.match_candidates_for_requirement(uuid, integer)
TO authenticated;


-- ============================================================================
-- 17. REMOVE ANON ACCESS
-- ============================================================================

REVOKE ALL ON public.candidates FROM anon;
REVOKE ALL ON public.candidate_skills FROM anon;
REVOKE ALL ON public.candidate_employment FROM anon;
REVOKE ALL ON public.candidate_education FROM anon;
REVOKE ALL ON public.candidate_projects FROM anon;
REVOKE ALL ON public.candidate_certifications FROM anon;
REVOKE ALL ON public.resumes FROM anon;
REVOKE ALL ON public.resume_versions FROM anon;
REVOKE ALL ON public.candidate_embeddings FROM anon;
REVOKE ALL ON public.requirement_embeddings FROM anon;


-- ============================================================================
-- 18. PREVENT TENANT SWITCHING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_candidate_tenant_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    THEN
        RAISE EXCEPTION 'Changing tenant ownership is not permitted';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_prevent_candidate_tenant_change
ON public.candidates;

CREATE TRIGGER trg_prevent_candidate_tenant_change
BEFORE UPDATE
ON public.candidates
FOR EACH ROW
EXECUTE FUNCTION public.prevent_candidate_tenant_change();


-- ============================================================================
-- 19. PREVENT AUTOMATIC FIRST-USER SUPER ADMIN
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    _full_name text;
BEGIN
    _full_name := COALESCE(
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'name',
        split_part(NEW.email, '@', 1)
    );

    /*
     * Create a profile only.
     *
     * Do NOT:
     *   - create a tenant automatically
     *   - assign super_admin
     *   - assign platform_owner
     *   - assign the user to the first tenant
     *
     * Tenant membership and privileged roles must be explicitly provisioned
     * by a trusted administrative workflow.
     */

    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        avatar_url,
        tenant_id
    )
    VALUES (
        NEW.id,
        NEW.email,
        _full_name,
        NEW.raw_user_meta_data ->> 'avatar_url',
        NULL
    )
    ON CONFLICT (id)
    DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url;

    RETURN NEW;
END;
$function$;


-- ============================================================================
-- 20. PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS candidates_tenant_id_idx
ON public.candidates(tenant_id);

CREATE INDEX IF NOT EXISTS resumes_tenant_id_idx
ON public.resumes(tenant_id);

CREATE INDEX IF NOT EXISTS profiles_tenant_id_idx
ON public.profiles(tenant_id);

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

CREATE INDEX IF NOT EXISTS resume_versions_candidate_id_idx
ON public.resume_versions(candidate_id);


COMMIT;