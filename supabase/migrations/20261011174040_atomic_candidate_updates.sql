BEGIN;
CREATE OR REPLACE FUNCTION public.update_candidate_graph(
  _candidate_id uuid, _candidate jsonb, _children jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE(candidate_id uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  updated_id uuid;
  assignments text;
  child_key text;
  columns_list text;
  select_list text;
  table_name text;
BEGIN
  IF auth.uid() IS NULL OR private.current_tenant_id() IS NULL OR NOT private.is_active_user() THEN
    RAISE EXCEPTION 'Active authentication is required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_candidate) IS DISTINCT FROM 'object'
     OR jsonb_typeof(_children) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid candidate update shape' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(_candidate) k WHERE NOT k = ANY(ARRAY[
    'first_name','last_name','email','phone','location','current_employer','current_title',
    'required_job','ready_to_relocate','preferred_location','primary_technology','visa_status',
    'marketing_types','availability','min_rate','max_rate','rate_type','currency',
    'experience_years','linkedin_url','github_url','portfolio_url','summary','ai_notes','ats_score','source'
  ])) THEN
    RAISE EXCEPTION 'Unsupported candidate field' USING ERRCODE = '22023';
  END IF;
  FOR child_key IN SELECT jsonb_object_keys(_children) LOOP
    IF NOT child_key = ANY(ARRAY['skills','employment','education','projects','certifications'])
       OR jsonb_typeof(_children -> child_key) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Unsupported candidate collection' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(_children -> child_key) >
       CASE child_key WHEN 'skills' THEN 120 WHEN 'education' THEN 20 ELSE 40 END THEN
      RAISE EXCEPTION 'Candidate collection exceeds limit' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- Serialize graph replacements. RLS still limits the visible and writable parent.
  PERFORM c.id FROM public.candidates c
    WHERE c.id = _candidate_id AND c.tenant_id = private.current_tenant_id() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found or access denied' USING ERRCODE = '42501';
  END IF;
  SELECT string_agg(format('%I = patch.%I', k, k), ', ')
    INTO assignments FROM jsonb_object_keys(_candidate) k;
  EXECUTE 'UPDATE public.candidates AS c SET ' ||
    COALESCE(assignments || ', ', '') || 'updated_at = now() ' ||
    'FROM jsonb_populate_record(NULL::public.candidates, $1) patch ' ||
    'WHERE c.id = $2 RETURNING c.id'
    INTO updated_id USING _candidate, _candidate_id;
  IF updated_id IS NULL THEN
    RAISE EXCEPTION 'Candidate not found or access denied' USING ERRCODE = '42501';
  END IF;
  -- Only whitelisted columns are inserted: JSON cannot set IDs or ownership.
  FOR child_key IN SELECT jsonb_object_keys(_children) LOOP
    CASE child_key
      WHEN 'skills' THEN
        table_name := 'candidate_skills';
        columns_list := 'skill, years, is_primary';
        select_list := 'btrim(x.skill), x.years, COALESCE(x.is_primary, false)';
      WHEN 'employment' THEN
        table_name := 'candidate_employment';
        columns_list := 'company, title, location, start_date, end_date, is_current, description';
        select_list := 'btrim(x.company), x.title, x.location, x.start_date, x.end_date, COALESCE(x.is_current, false), x.description';
      WHEN 'education' THEN
        table_name := 'candidate_education';
        columns_list := 'institution, degree, field, start_year, end_year';
        select_list := 'btrim(x.institution), x.degree, x.field, x.start_year, x.end_year';
      WHEN 'projects' THEN
        table_name := 'candidate_projects';
        columns_list := 'name, description, technologies';
        select_list := 'btrim(x.name), x.description, COALESCE(x.technologies, ARRAY[]::text[])';
      WHEN 'certifications' THEN
        table_name := 'candidate_certifications';
        columns_list := 'name, issuer, issued_date, expires_date, credential_id';
        select_list := 'btrim(x.name), x.issuer, x.issued_date, x.expires_date, x.credential_id';
    END CASE;
    EXECUTE format('DELETE FROM public.%I WHERE candidate_id = $1', table_name) USING _candidate_id;
    EXECUTE format(
      'INSERT INTO public.%I (candidate_id, %s) SELECT $1, %s FROM jsonb_populate_recordset(NULL::public.%I, $2) x',
      table_name, columns_list, select_list, table_name
    ) USING _candidate_id, _children -> child_key;
  END LOOP;
  RETURN QUERY SELECT updated_id;
END;
$$;
REVOKE ALL ON FUNCTION public.update_candidate_graph(uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_candidate_graph(uuid,jsonb,jsonb) TO authenticated;
COMMIT;
