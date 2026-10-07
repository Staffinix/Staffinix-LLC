-- ============ Tenant-scoped read policies ============
DROP POLICY IF EXISTS "candidates_read_all_auth" ON public.candidates;
CREATE POLICY "candidates_read_tenant" ON public.candidates FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read requirements" ON public.requirements;
CREATE POLICY "requirements_read_tenant" ON public.requirements FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read clients" ON public.clients;
CREATE POLICY "clients_read_tenant" ON public.clients FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read vendors" ON public.vendors;
CREATE POLICY "vendors_read_tenant" ON public.vendors FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Read skills" ON public.requirement_skills;
CREATE POLICY "req_skills_read_tenant" ON public.requirement_skills FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.requirements r WHERE r.id = requirement_skills.requirement_id));

-- Candidate child tables: visible only when the parent candidate is visible
DROP POLICY IF EXISTS "cskills_read" ON public.candidate_skills;
CREATE POLICY "cskills_read" ON public.candidate_skills FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_skills.candidate_id));

DROP POLICY IF EXISTS "cemp_read" ON public.candidate_employment;
CREATE POLICY "cemp_read" ON public.candidate_employment FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_employment.candidate_id));

DROP POLICY IF EXISTS "cedu_read" ON public.candidate_education;
CREATE POLICY "cedu_read" ON public.candidate_education FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_education.candidate_id));

DROP POLICY IF EXISTS "cproj_read" ON public.candidate_projects;
CREATE POLICY "cproj_read" ON public.candidate_projects FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_projects.candidate_id));

DROP POLICY IF EXISTS "ccert_read" ON public.candidate_certifications;
CREATE POLICY "ccert_read" ON public.candidate_certifications FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_certifications.candidate_id));

DROP POLICY IF EXISTS "cemb_read" ON public.candidate_embeddings;
CREATE POLICY "cemb_read" ON public.candidate_embeddings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_embeddings.candidate_id));

DROP POLICY IF EXISTS "rv_read" ON public.resume_versions;
CREATE POLICY "rv_read" ON public.resume_versions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = resume_versions.candidate_id));

DROP POLICY IF EXISTS "resumes_read" ON public.resumes;
CREATE POLICY "resumes_read" ON public.resumes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = resumes.candidate_id));

-- ============ Pipeline tables ============
DROP POLICY IF EXISTS "submissions_read_auth" ON public.submissions;
CREATE POLICY "submissions_read_tenant" ON public.submissions FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "submissions_insert_auth" ON public.submissions;
CREATE POLICY "submissions_insert_tenant" ON public.submissions FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "submissions_update_auth" ON public.submissions;
CREATE POLICY "submissions_update_tenant" ON public.submissions FOR UPDATE TO authenticated
USING (tenant_id = public.current_tenant_id())
WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "sub_events_read_auth" ON public.submission_events;
CREATE POLICY "sub_events_read_tenant" ON public.submission_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_events.submission_id));

DROP POLICY IF EXISTS "sub_events_insert_auth" ON public.submission_events;
CREATE POLICY "sub_events_insert_tenant" ON public.submission_events FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_events.submission_id));

DROP POLICY IF EXISTS "interviews_read_auth" ON public.interviews;
CREATE POLICY "interviews_read_tenant" ON public.interviews FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "interviews_insert_auth" ON public.interviews;
CREATE POLICY "interviews_insert_tenant" ON public.interviews FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = interviews.submission_id));

DROP POLICY IF EXISTS "interviews_update_auth" ON public.interviews;
CREATE POLICY "interviews_update_tenant" ON public.interviews FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = interviews.submission_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = interviews.submission_id));

DROP POLICY IF EXISTS "placements_read_auth" ON public.placements;
CREATE POLICY "placements_read_tenant" ON public.placements FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "placements_insert_auth" ON public.placements;
CREATE POLICY "placements_insert_tenant" ON public.placements FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = placements.submission_id));

DROP POLICY IF EXISTS "placements_update_auth" ON public.placements;
CREATE POLICY "placements_update_tenant" ON public.placements FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = placements.submission_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = placements.submission_id));

-- ============ SECURITY DEFINER function hardening ============
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;

-- Matching RPCs: restrict to caller's tenant so the definer rights cannot leak cross-tenant data
CREATE OR REPLACE FUNCTION public.search_candidates_semantic(_query_embedding vector, _limit integer DEFAULT 25)
RETURNS TABLE(candidate_id uuid, similarity real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT ce.candidate_id,
         (1 - (ce.embedding::halfvec(3072) <=> _query_embedding::halfvec(3072)))::real
  FROM public.candidate_embeddings ce
  JOIN public.candidates c ON c.id = ce.candidate_id
  WHERE c.tenant_id = public.current_tenant_id()
  ORDER BY ce.embedding::halfvec(3072) <=> _query_embedding::halfvec(3072)
  LIMIT _limit;
$function$;

CREATE OR REPLACE FUNCTION public.match_candidates_for_requirement(_requirement_id uuid, _limit integer DEFAULT 25)
RETURNS TABLE(candidate_id uuid, similarity real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT re.embedding FROM public.requirement_embeddings re
    JOIN public.requirements r ON r.id = re.requirement_id
    WHERE re.requirement_id = _requirement_id
      AND r.tenant_id = public.current_tenant_id()
  )
  SELECT ce.candidate_id,
         (1 - (ce.embedding::halfvec(3072) <=> (SELECT embedding FROM q)::halfvec(3072)))::real
  FROM public.candidate_embeddings ce
  JOIN public.candidates c ON c.id = ce.candidate_id, q
  WHERE c.tenant_id = public.current_tenant_id()
  ORDER BY ce.embedding::halfvec(3072) <=> (SELECT embedding FROM q)::halfvec(3072)
  LIMIT _limit;
$function$;

CREATE OR REPLACE FUNCTION public.match_requirements_for_candidate(_candidate_id uuid, _limit integer DEFAULT 25)
RETURNS TABLE(requirement_id uuid, similarity real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT ce.embedding FROM public.candidate_embeddings ce
    JOIN public.candidates c ON c.id = ce.candidate_id
    WHERE ce.candidate_id = _candidate_id
      AND c.tenant_id = public.current_tenant_id()
  )
  SELECT re.requirement_id,
         (1 - (re.embedding::halfvec(3072) <=> (SELECT embedding FROM q)::halfvec(3072)))::real
  FROM public.requirement_embeddings re
  JOIN public.requirements r ON r.id = re.requirement_id, q
  WHERE r.tenant_id = public.current_tenant_id()
  ORDER BY re.embedding::halfvec(3072) <=> (SELECT embedding FROM q)::halfvec(3072)
  LIMIT _limit;
$function$;

REVOKE ALL ON FUNCTION public.search_candidates_semantic(vector, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_candidates_for_requirement(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_requirements_for_candidate(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_candidates_semantic(vector, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_candidates_for_requirement(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_requirements_for_candidate(uuid, integer) TO authenticated;

-- ============ Storage: resumes bucket ownership ============
DROP POLICY IF EXISTS "resumes_bucket_read" ON storage.objects;
CREATE POLICY "resumes_bucket_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'resumes' AND (owner = auth.uid() OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "resumes_bucket_insert" ON storage.objects;
CREATE POLICY "resumes_bucket_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'resumes' AND owner = auth.uid() AND (storage.foldername(name))[1] = auth.uid()::text);