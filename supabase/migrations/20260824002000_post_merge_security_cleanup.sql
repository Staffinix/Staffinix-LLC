BEGIN;

-- Remove superseded policies left by earlier tenant migrations.
DROP POLICY IF EXISTS "candidates_read_tenant" ON public.candidates;
DROP POLICY IF EXISTS "candidates_select_same_tenant" ON public.candidates;
DROP POLICY IF EXISTS "candidates_insert_same_tenant" ON public.candidates;
DROP POLICY IF EXISTS "candidates_update_same_tenant" ON public.candidates;
DROP POLICY IF EXISTS "candidates_delete_same_tenant" ON public.candidates;
DROP POLICY IF EXISTS "candidate_skills_select_same_tenant" ON public.candidate_skills;
DROP POLICY IF EXISTS "candidate_skills_write_same_tenant" ON public.candidate_skills;
DROP POLICY IF EXISTS "candidate_employment_select_same_tenant" ON public.candidate_employment;
DROP POLICY IF EXISTS "candidate_employment_write_same_tenant" ON public.candidate_employment;
DROP POLICY IF EXISTS "candidate_education_select_same_tenant" ON public.candidate_education;
DROP POLICY IF EXISTS "candidate_education_write_same_tenant" ON public.candidate_education;
DROP POLICY IF EXISTS "candidate_projects_select_same_tenant" ON public.candidate_projects;
DROP POLICY IF EXISTS "candidate_projects_write_same_tenant" ON public.candidate_projects;
DROP POLICY IF EXISTS "candidate_certifications_select_same_tenant" ON public.candidate_certifications;
DROP POLICY IF EXISTS "candidate_certifications_write_same_tenant" ON public.candidate_certifications;
DROP POLICY IF EXISTS "resumes_select_same_tenant" ON public.resumes;
DROP POLICY IF EXISTS "resumes_write_same_tenant" ON public.resumes;
DROP POLICY IF EXISTS "resume_versions_select_same_tenant" ON public.resume_versions;
DROP POLICY IF EXISTS "resume_versions_write_same_tenant" ON public.resume_versions;
DROP POLICY IF EXISTS "candidate_embeddings_select_same_tenant" ON public.candidate_embeddings;
DROP POLICY IF EXISTS "requirement_embeddings_select_same_tenant" ON public.requirement_embeddings;

-- These RPCs are intentional authenticated APIs, never anonymous APIs.
REVOKE ALL ON FUNCTION public.match_candidates_for_requirement(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_candidates_for_requirement(uuid, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.match_requirements_for_candidate(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_requirements_for_candidate(uuid, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.search_candidates_semantic(vector, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_candidates_semantic(vector, integer) TO authenticated;

-- Prevent callers from using role-check helpers to enumerate another user's
-- authorization. Existing RLS calls pass auth.uid(), so behavior is preserved.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  );
$$;
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = _user_id
      AND role IN ('platform_owner'::public.platform_role, 'platform_admin'::public.platform_role)
  );
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;

-- Remove duplicate indexes; equivalent pre-existing indexes remain.
DROP INDEX IF EXISTS public.candidates_tenant_id_idx;
DROP INDEX IF EXISTS public.profiles_tenant_id_idx;
DROP INDEX IF EXISTS public.candidate_employment_candidate_id_idx;
DROP INDEX IF EXISTS public.candidate_education_candidate_id_idx;
DROP INDEX IF EXISTS public.candidate_projects_candidate_id_idx;
DROP INDEX IF EXISTS public.candidate_certifications_candidate_id_idx;
DROP INDEX IF EXISTS public.resume_versions_candidate_id_idx;

COMMIT;
