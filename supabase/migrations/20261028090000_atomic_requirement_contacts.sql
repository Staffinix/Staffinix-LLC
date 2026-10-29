BEGIN;
ALTER TABLE public.requirements ADD COLUMN vendor_email text, ADD COLUMN vendor_contact text;

UPDATE public.requirements r SET vendor_email = v.contact_email, vendor_contact = v.contact_phone
FROM public.vendors v WHERE r.vendor_id = v.id AND r.tenant_id = v.tenant_id;

-- Requirement-specific snapshots do not change the shared vendor record.
CREATE FUNCTION public.save_requirement(_id uuid, _fields jsonb, _skills jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE r public.requirements; saved_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_active_user() THEN
    RAISE EXCEPTION 'Active authentication required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_fields) IS DISTINCT FROM 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(_fields) AS k(key)
    WHERE NOT (key = ANY(ARRAY['title','client_id','vendor_id','vendor_email','vendor_contact',
      'location','work_mode','visa_types','rate_min','rate_max','rate_type','currency',
      'min_experience_years','max_experience_years','primary_technology','description',
      'recruiter_notes','status','priority','source','duration','assigned_to']))
  ) THEN RAISE EXCEPTION 'Invalid requirement fields' USING ERRCODE = '22023'; END IF;
  IF _id IS NULL THEN
    SELECT * INTO r FROM jsonb_populate_record(NULL::public.requirements, _fields);
    r.id := gen_random_uuid(); r.created_by := auth.uid(); r.tenant_id := private.current_tenant_id();
    r.status := coalesce(r.status, 'open'); r.priority := coalesce(r.priority, 'medium');
    r.source := coalesce(r.source, 'manual'); r.currency := coalesce(r.currency, 'USD');
  ELSE
    SELECT * INTO r FROM public.requirements WHERE id = _id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Requirement not found or access denied' USING ERRCODE = '42501'; END IF;
    SELECT * INTO r FROM jsonb_populate_record(r, _fields);
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY[r.title,r.vendor_email,r.vendor_contact,r.location,
      r.primary_technology,r.description,r.recruiter_notes,r.duration]) value
      WHERE nullif(btrim(value),'') IS NULL)
    OR r.client_id IS NULL OR r.vendor_id IS NULL OR r.work_mode IS NULL OR r.rate_type IS NULL
    OR r.min_experience_years IS NULL OR r.max_experience_years IS NULL
    OR r.min_experience_years < 0 OR r.max_experience_years < r.min_experience_years
    OR coalesce(cardinality(r.visa_types),0) = 0 OR r.currency IS DISTINCT FROM 'USD'
    OR r.vendor_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    OR r.rate_min < 0 OR r.rate_max < 0 OR r.rate_max < r.rate_min
  THEN RAISE EXCEPTION 'Complete all requirement details; only rates are optional' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = r.client_id AND tenant_id = r.tenant_id)
    OR NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = r.vendor_id AND tenant_id = r.tenant_id)
  THEN RAISE EXCEPTION 'Client or vendor not found in this tenant' USING ERRCODE = '42501'; END IF;
  IF _skills IS NOT NULL THEN
    IF jsonb_typeof(_skills) <> 'array' OR jsonb_array_length(_skills) NOT BETWEEN 1 AND 80
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(_skills) s WHERE jsonb_typeof(s) <> 'object'
        OR length(btrim(coalesce(s->>'skill',''))) NOT BETWEEN 1 AND 80)
    THEN RAISE EXCEPTION 'Add valid requirement skills' USING ERRCODE = '22023'; END IF;
  ELSIF _id IS NULL OR NOT EXISTS (SELECT 1 FROM public.requirement_skills WHERE requirement_id = _id) THEN
    RAISE EXCEPTION 'Add requirement skills' USING ERRCODE = '22023';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.requirements (id,tenant_id,created_by,title,client_id,vendor_id,vendor_email,vendor_contact,
      location,work_mode,visa_types,rate_min,rate_max,rate_type,currency,min_experience_years,max_experience_years,
      primary_technology,description,recruiter_notes,status,priority,source,duration,assigned_to,assigned_at)
    VALUES (r.id,r.tenant_id,r.created_by,r.title,r.client_id,r.vendor_id,r.vendor_email,r.vendor_contact,
      r.location,r.work_mode,r.visa_types,r.rate_min,r.rate_max,r.rate_type,r.currency,r.min_experience_years,r.max_experience_years,
      r.primary_technology,r.description,r.recruiter_notes,r.status,r.priority,r.source,r.duration,r.assigned_to,
      CASE WHEN r.assigned_to IS NOT NULL THEN now() END) RETURNING id INTO saved_id;
  ELSE
    UPDATE public.requirements SET title=r.title,client_id=r.client_id,vendor_id=r.vendor_id,
      vendor_email=r.vendor_email,vendor_contact=r.vendor_contact,location=r.location,work_mode=r.work_mode,
      visa_types=r.visa_types,rate_min=r.rate_min,rate_max=r.rate_max,rate_type=r.rate_type,currency=r.currency,
      min_experience_years=r.min_experience_years,max_experience_years=r.max_experience_years,
      primary_technology=r.primary_technology,description=r.description,recruiter_notes=r.recruiter_notes,
      status=r.status,priority=r.priority,source=r.source,duration=r.duration,assigned_to=r.assigned_to,
      assigned_at=CASE WHEN _fields ? 'assigned_to' THEN CASE WHEN r.assigned_to IS NOT NULL THEN now() END ELSE r.assigned_at END
    WHERE id = _id RETURNING id INTO saved_id;
    IF saved_id IS NULL THEN RAISE EXCEPTION 'Requirement update denied' USING ERRCODE = '42501'; END IF;
  END IF;
  IF _skills IS NOT NULL THEN
    DELETE FROM public.requirement_skills WHERE requirement_id = saved_id;
    INSERT INTO public.requirement_skills (requirement_id,skill,is_mandatory)
    SELECT saved_id,btrim(s->>'skill'),coalesce((s->>'is_mandatory')::boolean,false) FROM jsonb_array_elements(_skills) s;
  END IF;
  RETURN saved_id;
END $$;
REVOKE ALL ON FUNCTION public.save_requirement(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_requirement(uuid,jsonb,jsonb) TO authenticated;
COMMIT;
