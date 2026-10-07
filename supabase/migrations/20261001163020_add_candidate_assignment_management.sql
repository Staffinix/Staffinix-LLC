BEGIN;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.candidates AS c
SET assigned_at = COALESCE(c.assigned_at, c.updated_at),
    assigned_by = COALESCE(
      c.assigned_by,
      CASE WHEN EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = c.created_by)
        THEN c.created_by END
    )
WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS candidates_tenant_assignee_idx
  ON public.candidates (tenant_id, assigned_to, status);
CREATE INDEX IF NOT EXISTS candidates_assigned_by_idx
  ON public.candidates (assigned_by);
CREATE INDEX IF NOT EXISTS candidates_last_submitted_by_idx
  ON public.candidates (last_submitted_by);
CREATE INDEX IF NOT EXISTS candidates_submission_sort_idx
  ON public.candidates (tenant_id, last_submitted_at DESC)
  WHERE last_submitted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.candidate_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  previous_recruiter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  new_recruiter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  changed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS candidate_assignment_history_candidate_idx
  ON public.candidate_assignment_history (candidate_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS candidate_assignment_history_tenant_recruiter_idx
  ON public.candidate_assignment_history (tenant_id, new_recruiter_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS candidate_assignment_history_previous_recruiter_idx
  ON public.candidate_assignment_history (previous_recruiter_id);
CREATE INDEX IF NOT EXISTS candidate_assignment_history_new_recruiter_idx
  ON public.candidate_assignment_history (new_recruiter_id);
CREATE INDEX IF NOT EXISTS candidate_assignment_history_changed_by_idx
  ON public.candidate_assignment_history (changed_by);

CREATE TABLE IF NOT EXISTS public.candidate_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  previous_status public.candidate_status NOT NULL,
  new_status public.candidate_status NOT NULL,
  changed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS candidate_status_history_candidate_idx
  ON public.candidate_status_history (candidate_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS candidate_status_history_changed_by_idx
  ON public.candidate_status_history (changed_by);

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS candidate_status_at_submission public.candidate_status;

UPDATE public.candidates AS c
SET last_submitted_at = (
      SELECT s.submitted_at FROM public.submissions AS s
      WHERE s.candidate_id = c.id AND s.submitted_at IS NOT NULL
      ORDER BY s.submitted_at DESC, s.created_at DESC LIMIT 1
    ),
    last_submitted_by = (
      SELECT s.submitted_by FROM public.submissions AS s
      WHERE s.candidate_id = c.id AND s.submitted_at IS NOT NULL
      ORDER BY s.submitted_at DESC, s.created_at DESC LIMIT 1
    )
WHERE EXISTS (
  SELECT 1 FROM public.submissions AS s
  WHERE s.candidate_id = c.id AND s.submitted_at IS NOT NULL
);

CREATE OR REPLACE FUNCTION private.enforce_candidate_assignment_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_tenant uuid;
  actor_is_admin boolean;
  actor_is_recruiter boolean;
BEGIN
  -- Trusted migration and service-role writes have no end-user JWT. Anonymous
  -- clients still have no INSERT privilege, so only those trusted paths bypass.
  IF actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.tenant_id INTO actor_tenant
  FROM public.profiles AS p
  WHERE p.id = actor_id AND p.is_active = true;

  IF actor_tenant IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active authentication is required';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM actor_tenant THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Invalid tenant ownership';
  END IF;

  SELECT
    bool_or(ur.role IN ('super_admin'::public.app_role, 'admin'::public.app_role)),
    bool_or(ur.role = 'recruiter'::public.app_role)
  INTO actor_is_admin, actor_is_recruiter
  FROM public.user_roles AS ur
  WHERE ur.user_id = actor_id;

  actor_is_admin := COALESCE(actor_is_admin, false);
  actor_is_recruiter := COALESCE(actor_is_recruiter, false);

  IF NEW.status IS DISTINCT FROM 'active'::public.candidate_status AND NOT actor_is_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only L2 may set an initial non-active candidate status';
  END IF;

  IF NEW.assigned_to IS NULL THEN
    NEW.assigned_by := NULL;
    NEW.assigned_at := NULL;
  ELSIF actor_is_admin THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles AS p
      JOIN public.user_roles AS ur ON ur.user_id = p.id
      WHERE p.id = NEW.assigned_to
        AND p.tenant_id = actor_tenant
        AND p.is_active = true
        AND ur.role = 'recruiter'::public.app_role
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Eligible L4 recruiter not found';
    END IF;
    NEW.assigned_by := actor_id;
    NEW.assigned_at := statement_timestamp();
  ELSIF actor_is_recruiter AND NEW.assigned_to = actor_id THEN
    NEW.assigned_by := actor_id;
    NEW.assigned_at := statement_timestamp();
  ELSE
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only L2 may assign a candidate to another user';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_candidate_assignment_on_insert()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_candidates_enforce_assignment_on_insert ON public.candidates;
CREATE TRIGGER trg_candidates_enforce_assignment_on_insert
BEFORE INSERT ON public.candidates
FOR EACH ROW EXECUTE FUNCTION private.enforce_candidate_assignment_on_insert();

ALTER TABLE public.candidate_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_assignment_history FORCE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_status_history FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.candidate_assignment_history FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.candidate_status_history FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.candidate_assignment_history TO authenticated;
GRANT SELECT ON TABLE public.candidate_status_history TO authenticated;
GRANT ALL ON TABLE public.candidate_assignment_history TO service_role;
GRANT ALL ON TABLE public.candidate_status_history TO service_role;

CREATE POLICY candidate_assignment_history_select_l2 ON public.candidate_assignment_history
FOR SELECT TO authenticated
USING (
  (SELECT private.is_active_user())
  AND tenant_id = (SELECT private.current_tenant_id())
  AND (SELECT private.is_admin())
);

CREATE POLICY candidate_status_history_select_authorized ON public.candidate_status_history
FOR SELECT TO authenticated
USING (
  (SELECT private.is_active_user())
  AND tenant_id = (SELECT private.current_tenant_id())
  AND EXISTS (
    SELECT 1 FROM public.candidates AS c
    WHERE c.id = candidate_status_history.candidate_id
  )
);

-- A recruiter is an L4 candidate user. Other candidate-enabled tenant roles
-- retain their existing scope, while recruiters see only their active ownership.
DROP POLICY IF EXISTS candidates_select_same_tenant ON public.candidates;
DROP POLICY IF EXISTS candidates_insert_same_tenant ON public.candidates;
DROP POLICY IF EXISTS candidates_update_authorized ON public.candidates;
DROP POLICY IF EXISTS candidates_delete_admin ON public.candidates;

CREATE POLICY candidates_select_authorized_assignment ON public.candidates
FOR SELECT TO authenticated
USING (
  (SELECT private.is_active_user())
  AND (
    (SELECT private.is_platform_admin())
    OR (
      tenant_id = (SELECT private.current_tenant_id())
      AND (
        (SELECT private.is_admin())
        OR NOT (SELECT private.has_role('recruiter'::public.app_role))
        OR assigned_to = (SELECT auth.uid())
      )
    )
  )
);

CREATE POLICY candidates_insert_authorized_assignment ON public.candidates
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT private.is_active_user())
  AND tenant_id = (SELECT private.current_tenant_id())
  AND created_by = (SELECT auth.uid())
  AND (
    (SELECT private.is_admin())
    OR NOT (SELECT private.has_role('recruiter'::public.app_role))
    OR assigned_to = (SELECT auth.uid())
  )
);

CREATE POLICY candidates_update_authorized_assignment ON public.candidates
FOR UPDATE TO authenticated
USING (
  (SELECT private.is_active_user())
  AND tenant_id = (SELECT private.current_tenant_id())
  AND (
    (SELECT private.is_admin())
    OR assigned_to = (SELECT auth.uid())
    OR (
      created_by = (SELECT auth.uid())
      AND NOT (SELECT private.has_role('recruiter'::public.app_role))
    )
  )
)
WITH CHECK (tenant_id = (SELECT private.current_tenant_id()));

CREATE POLICY candidates_delete_l2 ON public.candidates
FOR DELETE TO authenticated
USING (
  (SELECT private.is_active_user())
  AND tenant_id = (SELECT private.current_tenant_id())
  AND (SELECT private.is_admin())
);

-- Ownership and workflow status are server-owned. Ordinary profile edits may
-- update business fields only; assignment and status use the atomic RPCs below.
REVOKE UPDATE ON TABLE public.candidates FROM authenticated;
GRANT UPDATE (
  first_name, last_name, email, phone, location, current_employer, current_title,
  required_job, ready_to_relocate, preferred_location, primary_technology,
  visa_status, marketing_types, availability, min_rate, max_rate, rate_type,
  currency, experience_years, linkedin_url, github_url, portfolio_url, summary,
  ai_notes, ats_score, source
) ON TABLE public.candidates TO authenticated;

-- Child records inherit candidate visibility. This closes direct REST access to
-- another recruiter's candidate graph, not only the top-level candidates table.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'candidate_skills', 'candidate_employment', 'candidate_education',
    'candidate_projects', 'candidate_certifications'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_select_same_tenant', table_name);
    EXECUTE format($policy$
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.candidates AS c
        WHERE c.id = public.%I.candidate_id
      ))
    $policy$, table_name || '_select_assigned_candidate', table_name, table_name);
  END LOOP;
END $$;

DROP POLICY IF EXISTS resumes_select_same_tenant ON public.resumes;
CREATE POLICY resumes_select_assigned_candidate ON public.resumes
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.candidates AS c WHERE c.id = resumes.candidate_id));

DROP POLICY IF EXISTS resume_versions_select_same_tenant ON public.resume_versions;
CREATE POLICY resume_versions_select_assigned_candidate ON public.resume_versions
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.candidates AS c WHERE c.id = resume_versions.candidate_id));

DROP POLICY IF EXISTS candidate_embeddings_select_same_tenant ON public.candidate_embeddings;
CREATE POLICY candidate_embeddings_select_assigned_candidate ON public.candidate_embeddings
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.candidates AS c WHERE c.id = candidate_embeddings.candidate_id));

-- Submission visibility and writes follow current candidate ownership. L2 sees
-- all tenant submissions; L4 sees and submits only their assigned candidates.
DROP POLICY IF EXISTS submissions_select_same_tenant ON public.submissions;
DROP POLICY IF EXISTS submissions_insert_same_tenant ON public.submissions;
DROP POLICY IF EXISTS submissions_update_same_tenant ON public.submissions;

CREATE POLICY submissions_select_candidate_scope ON public.submissions
FOR SELECT TO authenticated
USING (
  tenant_id = (SELECT private.current_tenant_id())
  AND EXISTS (SELECT 1 FROM public.candidates AS c WHERE c.id = submissions.candidate_id)
);

CREATE POLICY submissions_insert_candidate_scope ON public.submissions
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = (SELECT private.current_tenant_id())
  AND created_by = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.candidates AS c WHERE c.id = submissions.candidate_id)
  AND EXISTS (
    SELECT 1 FROM public.requirements AS r
    WHERE r.id = submissions.requirement_id AND r.tenant_id = submissions.tenant_id
  )
);

CREATE POLICY submissions_update_candidate_scope ON public.submissions
FOR UPDATE TO authenticated
USING (
  tenant_id = (SELECT private.current_tenant_id())
  AND EXISTS (SELECT 1 FROM public.candidates AS c WHERE c.id = submissions.candidate_id)
  AND (created_by = (SELECT auth.uid()) OR submitted_by = (SELECT auth.uid()) OR (SELECT private.is_admin()))
)
WITH CHECK (
  tenant_id = (SELECT private.current_tenant_id())
  AND EXISTS (SELECT 1 FROM public.candidates AS c WHERE c.id = submissions.candidate_id)
);

CREATE OR REPLACE FUNCTION private.enforce_submission_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage = 'draft'::public.submission_stage THEN
      NEW.submitted_by := NULL;
      NEW.submitted_at := NULL;
      NEW.candidate_status_at_submission := NULL;
    ELSE
      NEW.submitted_by := (SELECT auth.uid());
      NEW.submitted_at := statement_timestamp();
      SELECT c.status INTO NEW.candidate_status_at_submission
      FROM public.candidates AS c WHERE c.id = NEW.candidate_id;
    END IF;
  ELSIF OLD.submitted_at IS NULL AND NEW.stage <> 'draft'::public.submission_stage THEN
    NEW.submitted_by := (SELECT auth.uid());
    NEW.submitted_at := statement_timestamp();
    SELECT c.status INTO NEW.candidate_status_at_submission
    FROM public.candidates AS c WHERE c.id = NEW.candidate_id;
  ELSE
    NEW.submitted_by := OLD.submitted_by;
    NEW.submitted_at := OLD.submitted_at;
    NEW.candidate_status_at_submission := OLD.candidate_status_at_submission;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_submission_attribution() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_submissions_enforce_attribution ON public.submissions;
CREATE TRIGGER trg_submissions_enforce_attribution
BEFORE INSERT OR UPDATE OF stage, submitted_by, submitted_at, candidate_status_at_submission
ON public.submissions
FOR EACH ROW EXECUTE FUNCTION private.enforce_submission_attribution();

CREATE OR REPLACE FUNCTION private.refresh_candidate_submission_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_candidate_id uuid;
BEGIN
  FOR target_candidate_id IN
    SELECT DISTINCT candidate_id
    FROM (VALUES
      (CASE WHEN TG_OP <> 'DELETE' THEN NEW.candidate_id ELSE NULL END),
      (CASE WHEN TG_OP <> 'INSERT' THEN OLD.candidate_id ELSE NULL END)
    ) AS affected(candidate_id)
    WHERE candidate_id IS NOT NULL
  LOOP
    UPDATE public.candidates AS c
    SET last_submitted_at = (
          SELECT s.submitted_at
          FROM public.submissions AS s
          WHERE s.candidate_id = target_candidate_id AND s.submitted_at IS NOT NULL
          ORDER BY s.submitted_at DESC, s.created_at DESC
          LIMIT 1
        ),
        last_submitted_by = (
          SELECT s.submitted_by
          FROM public.submissions AS s
          WHERE s.candidate_id = target_candidate_id AND s.submitted_at IS NOT NULL
          ORDER BY s.submitted_at DESC, s.created_at DESC
          LIMIT 1
        )
    WHERE c.id = target_candidate_id;
  END LOOP;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.refresh_candidate_submission_summary()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_submissions_refresh_candidate_summary ON public.submissions;
CREATE TRIGGER trg_submissions_refresh_candidate_summary
AFTER INSERT OR DELETE OR UPDATE OF candidate_id, submitted_at, submitted_by
ON public.submissions
FOR EACH ROW EXECUTE FUNCTION private.refresh_candidate_submission_summary();

CREATE OR REPLACE FUNCTION public.assign_candidates_to_recruiter(
  _candidate_ids uuid[],
  _recruiter_id uuid
)
RETURNS TABLE(
  candidate_id uuid,
  previous_recruiter_id uuid,
  recruiter_id uuid,
  assigned_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_tenant uuid;
  assignment_time timestamptz := statement_timestamp();
  candidate_record record;
  normalized_ids uuid[];
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required'; END IF;

  SELECT p.tenant_id INTO actor_tenant
  FROM public.profiles AS p
  WHERE p.id = actor_id AND p.is_active = true;

  IF actor_tenant IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = actor_id
      AND ur.role IN ('super_admin'::public.app_role, 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'L2 candidate assignment permission is required';
  END IF;

  SELECT array_agg(DISTINCT candidate_value ORDER BY candidate_value)
  INTO normalized_ids
  FROM unnest(COALESCE(_candidate_ids, ARRAY[]::uuid[])) AS candidate_value;

  IF COALESCE(array_length(normalized_ids, 1), 0) = 0 OR array_length(normalized_ids, 1) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Select between 1 and 100 candidates';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    JOIN public.user_roles AS ur ON ur.user_id = p.id
    WHERE p.id = _recruiter_id
      AND p.tenant_id = actor_tenant
      AND p.is_active = true
      AND ur.role = 'recruiter'::public.app_role
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Eligible L4 recruiter not found';
  END IF;

  IF (SELECT count(*) FROM public.candidates AS c WHERE c.id = ANY(normalized_ids) AND c.tenant_id = actor_tenant)
     <> array_length(normalized_ids, 1) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'One or more candidates are outside your authorized scope';
  END IF;

  FOR candidate_record IN
    SELECT c.id, c.assigned_to
    FROM public.candidates AS c
    WHERE c.id = ANY(normalized_ids) AND c.tenant_id = actor_tenant
    ORDER BY c.id
    FOR UPDATE
  LOOP
    IF candidate_record.assigned_to IS DISTINCT FROM _recruiter_id THEN
      INSERT INTO public.candidate_assignment_history (
        tenant_id, candidate_id, previous_recruiter_id, new_recruiter_id, changed_by, changed_at
      ) VALUES (
        actor_tenant, candidate_record.id, candidate_record.assigned_to,
        _recruiter_id, actor_id, assignment_time
      );

      UPDATE public.candidates
      SET assigned_to = _recruiter_id,
          assigned_by = actor_id,
          assigned_at = assignment_time
      WHERE id = candidate_record.id;
    END IF;

    candidate_id := candidate_record.id;
    previous_recruiter_id := candidate_record.assigned_to;
    recruiter_id := _recruiter_id;
    assigned_at := assignment_time;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_candidate_status(
  _candidate_id uuid,
  _new_status public.candidate_status,
  _expected_updated_at timestamptz
)
RETURNS TABLE(
  candidate_id uuid,
  previous_status public.candidate_status,
  new_status public.candidate_status,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_tenant uuid;
  current_record record;
  changed_time timestamptz := statement_timestamp();
BEGIN
  SELECT p.tenant_id INTO actor_tenant
  FROM public.profiles AS p
  WHERE p.id = actor_id AND p.is_active = true;

  IF actor_tenant IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = actor_id
      AND ur.role IN ('super_admin'::public.app_role, 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'L2 candidate status permission is required';
  END IF;

  SELECT c.id, c.status, c.updated_at INTO current_record
  FROM public.candidates AS c
  WHERE c.id = _candidate_id AND c.tenant_id = actor_tenant
  FOR UPDATE;

  IF current_record.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Candidate not found';
  END IF;
  IF current_record.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Candidate changed since it was loaded; refresh and retry';
  END IF;

  IF current_record.status IS DISTINCT FROM _new_status THEN
    INSERT INTO public.candidate_status_history (
      tenant_id, candidate_id, previous_status, new_status, changed_by, changed_at
    ) VALUES (
      actor_tenant, _candidate_id, current_record.status, _new_status, actor_id, changed_time
    );
    UPDATE public.candidates SET status = _new_status, updated_at = changed_time
    WHERE id = _candidate_id;
  END IF;

  candidate_id := _candidate_id;
  previous_status := current_record.status;
  new_status := _new_status;
  updated_at := CASE WHEN current_record.status IS DISTINCT FROM _new_status THEN changed_time ELSE current_record.updated_at END;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_candidate_placed_from_submission(
  _submission_id uuid
)
RETURNS TABLE(candidate_id uuid, previous_status public.candidate_status, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_tenant uuid;
  submission_record record;
  candidate_record record;
  actor_is_admin boolean;
  changed_time timestamptz := statement_timestamp();
BEGIN
  SELECT p.tenant_id INTO actor_tenant
  FROM public.profiles AS p
  WHERE p.id = actor_id AND p.is_active = true;

  IF actor_tenant IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active authentication is required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = actor_id
      AND ur.role IN ('super_admin'::public.app_role, 'admin'::public.app_role)
  ) INTO actor_is_admin;

  SELECT s.candidate_id, s.created_by, s.submitted_by, s.stage
  INTO submission_record
  FROM public.submissions AS s
  WHERE s.id = _submission_id AND s.tenant_id = actor_tenant;

  IF submission_record.candidate_id IS NULL
     OR submission_record.stage IS DISTINCT FROM 'hired'::public.submission_stage THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A hired submission is required';
  END IF;
  IF NOT actor_is_admin
     AND submission_record.created_by IS DISTINCT FROM actor_id
     AND submission_record.submitted_by IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Submission workflow permission is required';
  END IF;

  SELECT c.id, c.status INTO candidate_record
  FROM public.candidates AS c
  WHERE c.id = submission_record.candidate_id
    AND c.tenant_id = actor_tenant
    AND (
      actor_is_admin
      OR NOT EXISTS (
        SELECT 1 FROM public.user_roles AS ur
        WHERE ur.user_id = actor_id AND ur.role = 'recruiter'::public.app_role
      )
      OR c.assigned_to = actor_id
    )
  FOR UPDATE;

  IF candidate_record.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Candidate access denied';
  END IF;

  IF candidate_record.status IS DISTINCT FROM 'placed'::public.candidate_status THEN
    INSERT INTO public.candidate_status_history (
      tenant_id, candidate_id, previous_status, new_status, changed_by, changed_at
    ) VALUES (
      actor_tenant, candidate_record.id, candidate_record.status,
      'placed'::public.candidate_status, actor_id, changed_time
    );
    UPDATE public.candidates
    SET status = 'placed'::public.candidate_status, updated_at = changed_time
    WHERE id = candidate_record.id;
  END IF;

  candidate_id := candidate_record.id;
  previous_status := candidate_record.status;
  updated_at := changed_time;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.candidate_assignment_kpis()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'assigned', count(*),
    'submitted', count(*) FILTER (WHERE c.last_submitted_at IS NOT NULL),
    'pending', count(*) FILTER (WHERE c.last_submitted_at IS NULL)
  )
  FROM public.candidates AS c
  WHERE c.tenant_id = private.current_tenant_id();
$$;

-- SECURITY DEFINER vector functions bypass table RLS. Repeat the assignment
-- scope inside them so semantic search cannot reveal another L4 recruiter's
-- candidate IDs through a direct RPC call.
CREATE OR REPLACE FUNCTION public.search_candidates_semantic(
  _query_embedding vector(3072),
  _limit integer DEFAULT 25
)
RETURNS TABLE(candidate_id uuid, similarity real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ce.candidate_id,
         (1 - (ce.embedding::public.halfvec(3072) OPERATOR(public.<=>) _query_embedding::public.halfvec(3072)))::real
  FROM public.candidate_embeddings AS ce
  JOIN public.candidates AS c ON c.id = ce.candidate_id
  WHERE c.tenant_id = private.current_tenant_id()
    AND (
      private.is_admin()
      OR NOT private.has_role('recruiter'::public.app_role)
      OR c.assigned_to = (SELECT auth.uid())
    )
  ORDER BY ce.embedding::public.halfvec(3072) OPERATOR(public.<=>) _query_embedding::public.halfvec(3072)
  LIMIT LEAST(GREATEST(_limit, 1), 50);
$$;

CREATE OR REPLACE FUNCTION public.match_candidates_for_requirement(
  _requirement_id uuid,
  _limit integer DEFAULT 25
)
RETURNS TABLE(candidate_id uuid, similarity real)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
    AND (
      private.is_admin()
      OR NOT private.has_role('recruiter'::public.app_role)
      OR c.assigned_to = (SELECT auth.uid())
    )
  ORDER BY ce.embedding::public.halfvec(3072) OPERATOR(public.<=>) re.embedding::public.halfvec(3072)
  LIMIT LEAST(GREATEST(_limit, 1), 50);
$$;

CREATE OR REPLACE FUNCTION public.match_requirements_for_candidate(
  _candidate_id uuid,
  _limit integer DEFAULT 25
)
RETURNS TABLE(requirement_id uuid, similarity real)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
    AND (
      private.is_admin()
      OR NOT private.has_role('recruiter'::public.app_role)
      OR c.assigned_to = (SELECT auth.uid())
    )
  ORDER BY re.embedding::public.halfvec(3072) OPERATOR(public.<=>) ce.embedding::public.halfvec(3072)
  LIMIT LEAST(GREATEST(_limit, 1), 50);
$$;

REVOKE ALL ON FUNCTION public.assign_candidates_to_recruiter(uuid[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_candidate_status(uuid, public.candidate_status, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_candidate_placed_from_submission(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.candidate_assignment_kpis() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_candidates_semantic(vector, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_candidates_for_requirement(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_requirements_for_candidate(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_candidates_to_recruiter(uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_candidate_status(uuid, public.candidate_status, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_candidate_placed_from_submission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_assignment_kpis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_candidates_semantic(vector, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_candidates_for_requirement(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_requirements_for_candidate(uuid, integer) TO authenticated;

COMMIT;
