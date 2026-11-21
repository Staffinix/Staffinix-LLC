-- Every L4 recruiter can read and work on every candidate in their company.
-- Unchanged: assigning candidates and changing candidate status stay L2-only
-- (column grants and RPC checks), deleting stays L2-only, tenants stay isolated.
BEGIN;

CREATE OR REPLACE FUNCTION private.candidate_on_my_desk(_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (SELECT private.is_admin())
    OR NOT (SELECT private.has_role('recruiter'::public.app_role))
    OR EXISTS (
      SELECT 1 FROM public.candidates AS c
      WHERE c.id = _candidate_id AND c.assigned_to = (SELECT auth.uid())
    );
$$;
REVOKE ALL ON FUNCTION private.candidate_on_my_desk(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.candidate_on_my_desk(uuid) TO authenticated;

ALTER POLICY candidates_select_authorized_assignment ON public.candidates
USING (
  (SELECT private.is_active_user())
  AND (
    (SELECT private.is_platform_admin())
    OR tenant_id = (SELECT private.current_tenant_id())
  )
);

ALTER POLICY candidates_update_authorized_assignment ON public.candidates
USING (
  (SELECT private.is_active_user())
  AND tenant_id = (SELECT private.current_tenant_id())
  AND (
    (SELECT private.is_admin())
    OR (SELECT private.has_role('recruiter'::public.app_role))
    OR assigned_to = (SELECT auth.uid())
    OR created_by = (SELECT auth.uid())
  )
)
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()));

CREATE OR REPLACE FUNCTION private.can_work_on_candidate(_created_by uuid, _assigned_to uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT _created_by = (SELECT auth.uid())
    OR _assigned_to = (SELECT auth.uid())
    OR (SELECT private.is_admin())
    OR (SELECT private.has_role('recruiter'::public.app_role));
$$;
REVOKE ALL ON FUNCTION private.can_work_on_candidate(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_work_on_candidate(uuid, uuid) TO authenticated;

DO $$
DECLARE
  child text;
  allowed text;
BEGIN
  FOREACH child IN ARRAY ARRAY[
    'candidate_skills', 'candidate_employment', 'candidate_education',
    'candidate_projects', 'candidate_certifications'
  ] LOOP
    allowed := format(
      'EXISTS (SELECT 1 FROM public.candidates AS c WHERE c.id = %I.candidate_id
        AND c.tenant_id = (SELECT private.current_tenant_id())
        AND private.can_work_on_candidate(c.created_by, c.assigned_to))',
      child
    );
    EXECUTE format(
      'ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
      child || '_manage_authorized', child, allowed, allowed
    );
  END LOOP;
END;
$$;

ALTER POLICY resumes_insert_authorized ON public.resumes
WITH CHECK (
  tenant_id = (SELECT private.current_tenant_id())
  AND EXISTS (
    SELECT 1 FROM public.candidates AS c
    WHERE c.id = resumes.candidate_id
      AND c.tenant_id = (SELECT private.current_tenant_id())
      AND private.can_work_on_candidate(c.created_by, c.assigned_to)
  )
);

ALTER POLICY resumes_update_authorized ON public.resumes
USING (
  tenant_id = (SELECT private.current_tenant_id())
  AND EXISTS (
    SELECT 1 FROM public.candidates AS c
    WHERE c.id = resumes.candidate_id
      AND c.tenant_id = (SELECT private.current_tenant_id())
      AND private.can_work_on_candidate(c.created_by, c.assigned_to)
  )
)
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()));

ALTER POLICY resume_versions_delete_unapproved ON public.resume_versions
USING (
  status <> 'approved'
  AND EXISTS (
    SELECT 1 FROM public.candidates AS c
    WHERE c.id = resume_versions.candidate_id
      AND c.tenant_id = (SELECT private.current_tenant_id())
      AND private.can_work_on_candidate(c.created_by, c.assigned_to)
  )
);

ALTER POLICY resume_versions_insert_fact_preserving ON public.resume_versions
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND status = 'draft'
  AND EXISTS (
    SELECT 1 FROM public.candidates AS c
    WHERE c.id = resume_versions.candidate_id
      AND c.tenant_id = (SELECT private.current_tenant_id())
      AND private.can_work_on_candidate(c.created_by, c.assigned_to)
  )
  AND (
    (requirement_id IS NULL AND source_resume_id IS NULL)
    OR (
      EXISTS (
        SELECT 1
        FROM public.requirements AS r
        JOIN public.candidates AS c ON c.id = resume_versions.candidate_id
        WHERE r.id = resume_versions.requirement_id
          AND r.tenant_id = c.tenant_id
          AND r.tenant_id = (SELECT private.current_tenant_id())
      )
      AND EXISTS (
        SELECT 1 FROM public.resumes AS s
        WHERE s.id = resume_versions.source_resume_id
          AND s.candidate_id = resume_versions.candidate_id
          AND s.tenant_id = (SELECT private.current_tenant_id())
          AND s.verification_status = 'verified'
      )
    )
  )
);

ALTER POLICY resume_versions_review_fact_preserving ON public.resume_versions
USING (
  status = 'draft'
  AND EXISTS (
    SELECT 1 FROM public.candidates AS c
    WHERE c.id = resume_versions.candidate_id
      AND c.tenant_id = (SELECT private.current_tenant_id())
      AND private.can_work_on_candidate(c.created_by, c.assigned_to)
  )
)
WITH CHECK (
  status = ANY (ARRAY['approved', 'rejected'])
  AND EXISTS (
    SELECT 1 FROM public.candidates AS c
    WHERE c.id = resume_versions.candidate_id
      AND c.tenant_id = (SELECT private.current_tenant_id())
      AND private.can_work_on_candidate(c.created_by, c.assigned_to)
  )
);

CREATE OR REPLACE FUNCTION public.match_candidates_for_requirement(_requirement_id uuid, _limit integer DEFAULT 25)
RETURNS TABLE(candidate_id uuid, similarity real)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ce.candidate_id,
         (1 - (ce.embedding::public.halfvec(3072) OPERATOR(public.<=>) re.embedding::public.halfvec(3072)))::real
  FROM public.requirement_embeddings AS re
  JOIN public.requirements AS r ON r.id = re.requirement_id
  JOIN public.candidate_embeddings AS ce ON true
  JOIN public.candidates AS c ON c.id = ce.candidate_id
  WHERE re.requirement_id = _requirement_id
    AND r.tenant_id = private.current_tenant_id()
    AND c.tenant_id = private.current_tenant_id()
  ORDER BY ce.embedding::public.halfvec(3072) OPERATOR(public.<=>) re.embedding::public.halfvec(3072)
  LIMIT LEAST(GREATEST(_limit, 1), 50);
$$;

CREATE OR REPLACE FUNCTION public.match_requirements_for_candidate(_candidate_id uuid, _limit integer DEFAULT 25)
RETURNS TABLE(requirement_id uuid, similarity real)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT re.requirement_id,
         (1 - (re.embedding::public.halfvec(3072) OPERATOR(public.<=>) ce.embedding::public.halfvec(3072)))::real
  FROM public.candidate_embeddings AS ce
  JOIN public.candidates AS c ON c.id = ce.candidate_id
  JOIN public.requirement_embeddings AS re ON true
  JOIN public.requirements AS r ON r.id = re.requirement_id
  WHERE ce.candidate_id = _candidate_id
    AND c.tenant_id = private.current_tenant_id()
    AND r.tenant_id = private.current_tenant_id()
  ORDER BY re.embedding::public.halfvec(3072) OPERATOR(public.<=>) ce.embedding::public.halfvec(3072)
  LIMIT LEAST(GREATEST(_limit, 1), 50);
$$;

CREATE OR REPLACE FUNCTION public.search_candidates_semantic(_query_embedding vector, _limit integer DEFAULT 25)
RETURNS TABLE(candidate_id uuid, similarity real)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ce.candidate_id,
         (1 - (ce.embedding::public.halfvec(3072) OPERATOR(public.<=>) _query_embedding::public.halfvec(3072)))::real
  FROM public.candidate_embeddings AS ce
  JOIN public.candidates AS c ON c.id = ce.candidate_id
  WHERE c.tenant_id = private.current_tenant_id()
  ORDER BY ce.embedding::public.halfvec(3072) OPERATOR(public.<=>) _query_embedding::public.halfvec(3072)
  LIMIT LEAST(GREATEST(_limit, 1), 50);
$$;

-- Dashboards say "My ...": keep an L4's numbers limited to their assigned candidates.
CREATE OR REPLACE FUNCTION public.candidate_assignment_kpis()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'assigned', count(*),
    'submitted', count(*) FILTER (WHERE c.last_submitted_at IS NOT NULL),
    'pending', count(*) FILTER (WHERE c.last_submitted_at IS NULL)
  )
  FROM public.candidates AS c
  WHERE c.tenant_id = private.current_tenant_id()
    AND private.candidate_on_my_desk(c.id);
$$;

DO $$
DECLARE
  definition text := pg_get_functiondef('public.dashboard_overview()'::regprocedure);
  placed text := pg_get_functiondef('public.mark_candidate_placed_from_submission(uuid)'::regprocedure);
BEGIN
  IF (length(definition) - length(replace(definition, 'WHERE s.tenant_id = ctx.tenant_id', '')))
       / length('WHERE s.tenant_id = ctx.tenant_id') <> 3
     OR position('WHERE c.tenant_id = ctx.tenant_id' IN definition) = 0
     OR position('WHERE i.tenant_id = ctx.tenant_id' IN definition) = 0
     OR position('OR c.assigned_to = actor_id' IN placed) = 0 THEN
    RAISE EXCEPTION 'Unexpected function definition; L4 access migration not applied';
  END IF;

  definition := replace(definition, 'WHERE s.tenant_id = ctx.tenant_id',
    'WHERE s.tenant_id = ctx.tenant_id AND private.candidate_on_my_desk(s.candidate_id)');
  definition := replace(definition, 'WHERE c.tenant_id = ctx.tenant_id',
    'WHERE c.tenant_id = ctx.tenant_id AND private.candidate_on_my_desk(c.id)');
  definition := replace(definition, 'WHERE i.tenant_id = ctx.tenant_id',
    'WHERE i.tenant_id = ctx.tenant_id AND EXISTS (SELECT 1 FROM public.submissions AS desk WHERE desk.id = i.submission_id AND private.candidate_on_my_desk(desk.candidate_id))');
  EXECUTE definition;

  EXECUTE replace(placed, 'OR c.assigned_to = actor_id', 'OR c.tenant_id = actor_tenant');
END;
$$;

COMMIT;
