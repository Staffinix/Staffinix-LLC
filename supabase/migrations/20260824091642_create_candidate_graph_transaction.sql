BEGIN;

-- Candidate embeddings are external API work and must not extend the database
-- transaction. Keep a durable, private outbox row so a committed candidate is
-- never dependent on an in-process promise surviving a server restart.
CREATE TABLE private.candidate_embedding_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE
    REFERENCES public.candidates(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'failed', 'completed', 'dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX candidate_embedding_jobs_ready_idx
ON private.candidate_embedding_jobs(available_at, created_at)
WHERE status IN ('queued', 'failed');

REVOKE ALL ON TABLE private.candidate_embedding_jobs FROM PUBLIC, anon, authenticated;

-- Every candidate insert creates its audit record and embedding outbox entry in
-- the same transaction. If either invariant cannot be recorded, the candidate
-- insert fails and PostgreSQL rolls the whole graph back.
CREATE OR REPLACE FUNCTION private.after_candidate_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_email text;
BEGIN
  SELECT p.email
  INTO actor_email
  FROM public.profiles AS p
  WHERE p.id = NEW.created_by;

  INSERT INTO public.audit_logs (
    tenant_id,
    actor_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    NEW.tenant_id,
    NEW.created_by,
    actor_email,
    CASE
      WHEN NEW.source IN (
        'paste'::public.requirement_source,
        'pdf'::public.requirement_source,
        'docx'::public.requirement_source,
        'email'::public.requirement_source
      ) THEN 'candidate.parsed'
      ELSE 'candidate.created'
    END,
    'candidate',
    NEW.id::text,
    jsonb_build_object(
      'name', concat_ws(' ', NEW.first_name, NEW.last_name),
      'source', NEW.source
    )
  );

  INSERT INTO private.candidate_embedding_jobs (candidate_id, tenant_id)
  VALUES (NEW.id, NEW.tenant_id);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.after_candidate_created() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_candidates_after_create ON public.candidates;
CREATE TRIGGER trg_candidates_after_create
AFTER INSERT ON public.candidates
FOR EACH ROW
EXECUTE FUNCTION private.after_candidate_created();

-- Repair candidates whose earlier best-effort embedding attempt never
-- persisted. Existing valid embeddings are left untouched.
INSERT INTO private.candidate_embedding_jobs (candidate_id, tenant_id)
SELECT c.id, c.tenant_id
FROM public.candidates AS c
LEFT JOIN public.candidate_embeddings AS ce ON ce.candidate_id = c.id
WHERE ce.candidate_id IS NULL
ON CONFLICT (candidate_id) DO NOTHING;

-- A PostgREST RPC call is one PostgreSQL transaction. SECURITY INVOKER keeps
-- the existing table grants, RLS policies and tenant-integrity triggers in the
-- authorization path; tenant_id and created_by are derived from the JWT.
CREATE OR REPLACE FUNCTION public.create_candidate_graph(
  _candidate jsonb,
  _skills jsonb DEFAULT '[]'::jsonb,
  _employment jsonb DEFAULT '[]'::jsonb,
  _education jsonb DEFAULT '[]'::jsonb,
  _projects jsonb DEFAULT '[]'::jsonb,
  _certifications jsonb DEFAULT '[]'::jsonb,
  _resume jsonb DEFAULT NULL
)
RETURNS TABLE(candidate_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_tenant_id uuid := private.current_tenant_id();
  new_candidate_id uuid;
BEGIN
  IF actor_id IS NULL
     OR actor_tenant_id IS NULL
     OR NOT private.is_active_user() THEN
    RAISE EXCEPTION 'Active authentication is required' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(_candidate) IS DISTINCT FROM 'object'
     OR jsonb_typeof(COALESCE(_skills, '[]'::jsonb)) IS DISTINCT FROM 'array'
     OR jsonb_typeof(COALESCE(_employment, '[]'::jsonb)) IS DISTINCT FROM 'array'
     OR jsonb_typeof(COALESCE(_education, '[]'::jsonb)) IS DISTINCT FROM 'array'
     OR jsonb_typeof(COALESCE(_projects, '[]'::jsonb)) IS DISTINCT FROM 'array'
     OR jsonb_typeof(COALESCE(_certifications, '[]'::jsonb)) IS DISTINCT FROM 'array'
     OR (_resume IS NOT NULL AND jsonb_typeof(_resume) IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION 'Candidate graph contains an invalid JSON shape' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(_candidate ->> 'first_name'), '') IS NULL
     OR NULLIF(btrim(_candidate ->> 'last_name'), '') IS NULL THEN
    RAISE EXCEPTION 'Candidate first and last name are required' USING ERRCODE = '23502';
  END IF;

  INSERT INTO public.candidates (
    tenant_id,
    first_name,
    last_name,
    email,
    phone,
    location,
    current_employer,
    current_title,
    primary_technology,
    visa_status,
    availability,
    min_rate,
    max_rate,
    rate_type,
    currency,
    experience_years,
    linkedin_url,
    github_url,
    portfolio_url,
    summary,
    ai_notes,
    ats_score,
    status,
    assigned_to,
    source,
    created_by
  ) VALUES (
    actor_tenant_id,
    btrim(_candidate ->> 'first_name'),
    btrim(_candidate ->> 'last_name'),
    NULLIF(_candidate ->> 'email', ''),
    NULLIF(_candidate ->> 'phone', ''),
    NULLIF(_candidate ->> 'location', ''),
    NULLIF(_candidate ->> 'current_employer', ''),
    NULLIF(_candidate ->> 'current_title', ''),
    NULLIF(_candidate ->> 'primary_technology', ''),
    NULLIF(_candidate ->> 'visa_status', ''),
    NULLIF(_candidate ->> 'availability', '')::public.availability_status,
    NULLIF(_candidate ->> 'min_rate', '')::numeric,
    NULLIF(_candidate ->> 'max_rate', '')::numeric,
    NULLIF(_candidate ->> 'rate_type', '')::public.requirement_rate_type,
    COALESCE(NULLIF(_candidate ->> 'currency', ''), 'USD'),
    NULLIF(_candidate ->> 'experience_years', '')::numeric,
    NULLIF(_candidate ->> 'linkedin_url', ''),
    NULLIF(_candidate ->> 'github_url', ''),
    NULLIF(_candidate ->> 'portfolio_url', ''),
    NULLIF(_candidate ->> 'summary', ''),
    NULLIF(_candidate ->> 'ai_notes', ''),
    NULLIF(_candidate ->> 'ats_score', '')::integer,
    COALESCE(NULLIF(_candidate ->> 'status', ''), 'active')::public.candidate_status,
    NULLIF(_candidate ->> 'assigned_to', '')::uuid,
    COALESCE(NULLIF(_candidate ->> 'source', ''), 'manual')::public.requirement_source,
    actor_id
  )
  RETURNING id INTO new_candidate_id;

  INSERT INTO public.candidate_skills (candidate_id, skill, years, is_primary)
  SELECT new_candidate_id, btrim(x.skill), x.years, COALESCE(x.is_primary, false)
  FROM jsonb_to_recordset(COALESCE(_skills, '[]'::jsonb))
    AS x(skill text, years numeric, is_primary boolean);

  INSERT INTO public.candidate_employment (
    candidate_id, company, title, location, start_date, end_date, is_current, description
  )
  SELECT
    new_candidate_id,
    btrim(x.company),
    x.title,
    x.location,
    x.start_date,
    x.end_date,
    COALESCE(x.is_current, false),
    x.description
  FROM jsonb_to_recordset(COALESCE(_employment, '[]'::jsonb))
    AS x(
      company text,
      title text,
      location text,
      start_date date,
      end_date date,
      is_current boolean,
      description text
    );

  INSERT INTO public.candidate_education (
    candidate_id, institution, degree, field, start_year, end_year
  )
  SELECT new_candidate_id, btrim(x.institution), x.degree, x.field, x.start_year, x.end_year
  FROM jsonb_to_recordset(COALESCE(_education, '[]'::jsonb))
    AS x(
      institution text,
      degree text,
      field text,
      start_year integer,
      end_year integer
    );

  INSERT INTO public.candidate_projects (candidate_id, name, description, technologies)
  SELECT new_candidate_id, btrim(x.name), x.description, COALESCE(x.technologies, ARRAY[]::text[])
  FROM jsonb_to_recordset(COALESCE(_projects, '[]'::jsonb))
    AS x(name text, description text, technologies text[]);

  INSERT INTO public.candidate_certifications (
    candidate_id, name, issuer, issued_date, expires_date, credential_id
  )
  SELECT
    new_candidate_id,
    btrim(x.name),
    x.issuer,
    x.issued_date,
    x.expires_date,
    x.credential_id
  FROM jsonb_to_recordset(COALESCE(_certifications, '[]'::jsonb))
    AS x(
      name text,
      issuer text,
      issued_date date,
      expires_date date,
      credential_id text
    );

  IF _resume IS NOT NULL THEN
    INSERT INTO public.resumes (
      tenant_id,
      candidate_id,
      file_path,
      file_name,
      mime_type,
      size_bytes,
      is_primary,
      extracted_text,
      source,
      uploaded_by
    ) VALUES (
      actor_tenant_id,
      new_candidate_id,
      COALESCE(NULLIF(_resume ->> 'file_path', ''), 'inline://' || new_candidate_id::text),
      COALESCE(NULLIF(_resume ->> 'file_name', ''), 'resume.txt'),
      NULLIF(_resume ->> 'mime_type', ''),
      NULLIF(_resume ->> 'size_bytes', '')::bigint,
      COALESCE((_resume ->> 'is_primary')::boolean, true),
      _resume ->> 'extracted_text',
      COALESCE(NULLIF(_resume ->> 'source', ''), 'manual')::public.requirement_source,
      actor_id
    );
  END IF;

  RETURN QUERY SELECT new_candidate_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_candidate_graph(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_candidate_graph(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) TO authenticated;

-- Service-role-only queue APIs. The worker claims rows with SKIP LOCKED so
-- overlapping cron invocations cannot process the same candidate at once.
CREATE OR REPLACE FUNCTION public.claim_candidate_embedding_jobs(_limit integer DEFAULT 10)
RETURNS TABLE(job_id uuid, candidate_id uuid, attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE private.candidate_embedding_jobs AS stale
  SET
    status = CASE WHEN stale.attempts >= 5 THEN 'dead' ELSE 'queued' END,
    locked_at = NULL,
    available_at = now(),
    updated_at = now(),
    last_error = COALESCE(stale.last_error, 'Worker lease expired')
  WHERE stale.status = 'processing'
    AND stale.locked_at < now() - interval '15 minutes';

  RETURN QUERY
  WITH ready AS (
    SELECT j.id
    FROM private.candidate_embedding_jobs AS j
    WHERE j.status IN ('queued', 'failed')
      AND j.available_at <= now()
      AND j.attempts < 5
    ORDER BY j.available_at, j.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(_limit, 10), 1), 25)
  )
  UPDATE private.candidate_embedding_jobs AS j
  SET
    status = 'processing',
    attempts = j.attempts + 1,
    locked_at = now(),
    updated_at = now(),
    last_error = NULL
  FROM ready
  WHERE j.id = ready.id
  RETURNING j.id, j.candidate_id, j.attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_candidate_embedding_job(_job_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE private.candidate_embedding_jobs
  SET
    status = 'completed',
    completed_at = now(),
    locked_at = NULL,
    last_error = NULL,
    updated_at = now()
  WHERE id = _job_id
    AND status = 'processing';
$$;

CREATE OR REPLACE FUNCTION public.fail_candidate_embedding_job(_job_id uuid, _error text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE private.candidate_embedding_jobs
  SET
    status = CASE WHEN attempts >= 5 THEN 'dead' ELSE 'failed' END,
    available_at = now() + (
      LEAST(60, power(2, GREATEST(attempts - 1, 0))::integer) * interval '1 minute'
    ),
    locked_at = NULL,
    last_error = left(COALESCE(_error, 'Unknown embedding failure'), 1000),
    updated_at = now()
  WHERE id = _job_id
    AND status = 'processing';
$$;

REVOKE ALL ON FUNCTION public.claim_candidate_embedding_jobs(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_candidate_embedding_job(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_candidate_embedding_job(uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_candidate_embedding_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_candidate_embedding_job(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_candidate_embedding_job(uuid, text) TO service_role;

COMMIT;
