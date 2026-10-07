BEGIN;

ALTER TABLE public.candidates
  ADD COLUMN marketing_types text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.candidates
  ADD CONSTRAINT candidates_marketing_types_allowed
  CHECK (
    marketing_types <@ ARRAY['C2C', 'W2', 'Full-Time', '1099']::text[]
    AND cardinality(marketing_types) <= 4
    AND cardinality(array_positions(marketing_types, 'C2C')) <= 1
    AND cardinality(array_positions(marketing_types, 'W2')) <= 1
    AND cardinality(array_positions(marketing_types, 'Full-Time')) <= 1
    AND cardinality(array_positions(marketing_types, '1099')) <= 1
  );

CREATE OR REPLACE FUNCTION private.normalize_candidate_us_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  digits text;
BEGIN
  IF NEW.phone IS NULL OR btrim(NEW.phone) = '' THEN
    NEW.phone := NULL;
    RETURN NEW;
  END IF;

  IF NEW.phone !~ '^([+]?[1][ .-]?)?(\([2-9][0-9]{2}\)|[2-9][0-9]{2})[ .-]?[2-9][0-9]{2}[ .-]?[0-9]{4}$' THEN
    RAISE EXCEPTION 'Enter a valid 10-digit US phone number'
      USING ERRCODE = '22023';
  END IF;

  digits := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
  IF length(digits) = 11 AND left(digits, 1) = '1' THEN
    digits := right(digits, 10);
  END IF;

  IF digits !~ '^[2-9][0-9]{2}[2-9][0-9]{6}$'
     OR substring(digits FROM 2 FOR 2) = '11'
     OR substring(digits FROM 5 FOR 2) = '11' THEN
    RAISE EXCEPTION 'Enter a valid 10-digit US phone number'
      USING ERRCODE = '22023';
  END IF;

  NEW.phone := '+1' || digits;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_candidate_us_phone ON public.candidates;
CREATE TRIGGER normalize_candidate_us_phone
BEFORE INSERT OR UPDATE OF phone ON public.candidates
FOR EACH ROW EXECUTE FUNCTION private.normalize_candidate_us_phone();

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
  IF actor_id IS NULL OR actor_tenant_id IS NULL OR NOT private.is_active_user() THEN
    RAISE EXCEPTION 'Active authentication is required' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(_candidate) IS DISTINCT FROM 'object'
     OR jsonb_typeof(COALESCE(_candidate -> 'marketing_types', '[]'::jsonb)) IS DISTINCT FROM 'array'
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

  IF (_candidate ->> 'ready_to_relocate')::boolean IS false
     AND NULLIF(btrim(_candidate ->> 'preferred_location'), '') IS NULL THEN
    RAISE EXCEPTION 'Preferred location is required when a candidate is not ready to relocate'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.candidates (
    tenant_id, first_name, last_name, email, phone, location, current_employer,
    current_title, required_job, ready_to_relocate, preferred_location,
    primary_technology, visa_status, marketing_types, availability, min_rate,
    max_rate, rate_type, currency, experience_years, linkedin_url, github_url,
    portfolio_url, summary, ai_notes, ats_score, status, assigned_to, source, created_by
  ) VALUES (
    actor_tenant_id,
    btrim(_candidate ->> 'first_name'),
    btrim(_candidate ->> 'last_name'),
    NULLIF(_candidate ->> 'email', ''),
    NULLIF(_candidate ->> 'phone', ''),
    NULLIF(_candidate ->> 'location', ''),
    NULLIF(_candidate ->> 'current_employer', ''),
    NULLIF(_candidate ->> 'current_title', ''),
    NULLIF(_candidate ->> 'required_job', ''),
    NULLIF(_candidate ->> 'ready_to_relocate', '')::boolean,
    NULLIF(_candidate ->> 'preferred_location', ''),
    NULLIF(_candidate ->> 'primary_technology', ''),
    NULLIF(_candidate ->> 'visa_status', ''),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_candidate -> 'marketing_types', '[]'::jsonb))),
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
  ) RETURNING id INTO new_candidate_id;

  INSERT INTO public.candidate_skills (candidate_id, skill, years, is_primary)
  SELECT new_candidate_id, btrim(x.skill), x.years, COALESCE(x.is_primary, false)
  FROM jsonb_to_recordset(COALESCE(_skills, '[]'::jsonb))
    AS x(skill text, years numeric, is_primary boolean);

  INSERT INTO public.candidate_employment (
    candidate_id, company, title, location, start_date, end_date, is_current, description
  )
  SELECT new_candidate_id, btrim(x.company), x.title, x.location, x.start_date, x.end_date,
    COALESCE(x.is_current, false), x.description
  FROM jsonb_to_recordset(COALESCE(_employment, '[]'::jsonb))
    AS x(company text, title text, location text, start_date date, end_date date,
      is_current boolean, description text);

  INSERT INTO public.candidate_education (
    candidate_id, institution, degree, field, start_year, end_year
  )
  SELECT new_candidate_id, btrim(x.institution), x.degree, x.field, x.start_year, x.end_year
  FROM jsonb_to_recordset(COALESCE(_education, '[]'::jsonb))
    AS x(institution text, degree text, field text, start_year integer, end_year integer);

  INSERT INTO public.candidate_projects (candidate_id, name, description, technologies)
  SELECT new_candidate_id, btrim(x.name), x.description, COALESCE(x.technologies, ARRAY[]::text[])
  FROM jsonb_to_recordset(COALESCE(_projects, '[]'::jsonb))
    AS x(name text, description text, technologies text[]);

  INSERT INTO public.candidate_certifications (
    candidate_id, name, issuer, issued_date, expires_date, credential_id
  )
  SELECT new_candidate_id, btrim(x.name), x.issuer, x.issued_date, x.expires_date, x.credential_id
  FROM jsonb_to_recordset(COALESCE(_certifications, '[]'::jsonb))
    AS x(name text, issuer text, issued_date date, expires_date date, credential_id text);

  IF _resume IS NOT NULL THEN
    INSERT INTO public.resumes (
      tenant_id, candidate_id, file_path, file_name, mime_type, size_bytes,
      is_primary, extracted_text, source, uploaded_by
    ) VALUES (
      actor_tenant_id, new_candidate_id,
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

COMMIT;
