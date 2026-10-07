BEGIN;

-- The post-merge cleanup removed the final tenant SELECT policies after the
-- earlier broad policy reset had already removed their legacy replacements.
-- Restore the fail-closed policies so tenant members can read their own data
-- while never seeing another tenant's rows.
CREATE POLICY candidates_select_same_tenant ON public.candidates
FOR SELECT TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()));

CREATE POLICY candidates_insert_same_tenant ON public.candidates
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()) AND created_by = (SELECT auth.uid()));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'candidate_skills', 'candidate_employment', 'candidate_education',
    'candidate_projects', 'candidate_certifications'
  ] LOOP
    EXECUTE format($policy$
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.candidates AS c
        WHERE c.id = public.%I.candidate_id
          AND (c.tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()))
      ))
    $policy$, t || '_select_same_tenant', t, t);
  END LOOP;
END $$;

CREATE POLICY resumes_select_same_tenant ON public.resumes
FOR SELECT TO authenticated
USING (tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()));

CREATE POLICY resume_versions_select_same_tenant ON public.resume_versions
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.candidates AS c
  WHERE c.id = resume_versions.candidate_id
    AND (c.tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()))
));

CREATE POLICY candidate_embeddings_select_same_tenant ON public.candidate_embeddings
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.candidates AS c
  WHERE c.id = candidate_embeddings.candidate_id
    AND (c.tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()))
));

CREATE POLICY requirement_embeddings_select_same_tenant ON public.requirement_embeddings
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.requirements AS r
  WHERE r.id = requirement_embeddings.requirement_id
    AND (r.tenant_id = (SELECT private.current_tenant_id()) OR (SELECT private.is_platform_admin()))
));

COMMIT;
