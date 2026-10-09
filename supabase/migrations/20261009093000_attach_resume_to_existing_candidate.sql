BEGIN;

CREATE OR REPLACE FUNCTION public.attach_candidate_resume_from_upload(
  _candidate_id uuid,
  _resume_upload_id uuid,
  _extracted_text text DEFAULT NULL
)
RETURNS TABLE(resume_id uuid, resume_path text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  upload_grant record;
  candidate_tenant_id uuid;
  new_resume_id uuid;
  canonical_path text;
BEGIN
  SELECT c.tenant_id
  INTO candidate_tenant_id
  FROM public.candidates AS c
  WHERE c.id = _candidate_id;

  IF candidate_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Candidate not found or access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO upload_grant
  FROM private.claim_resume_upload(_resume_upload_id);

  IF upload_grant.tenant_id IS DISTINCT FROM candidate_tenant_id THEN
    RAISE EXCEPTION 'Resume upload and candidate must belong to the same tenant'
      USING ERRCODE = '42501';
  END IF;

  canonical_path := upload_grant.tenant_id::text || '/' || _candidate_id::text ||
    '/' || upload_grant.object_id::text || '.' || upload_grant.extension;

  UPDATE public.resumes
  SET is_primary = false
  WHERE candidate_id = _candidate_id
    AND is_primary = true;

  INSERT INTO public.resumes (
    tenant_id, candidate_id, file_path, file_name, mime_type, size_bytes,
    is_primary, extracted_text, source, uploaded_by
  ) VALUES (
    upload_grant.tenant_id,
    _candidate_id,
    canonical_path,
    upload_grant.file_name,
    upload_grant.mime_type,
    upload_grant.size_bytes,
    true,
    _extracted_text,
    CASE WHEN upload_grant.extension = 'pdf' THEN 'pdf' ELSE 'docx' END::public.requirement_source,
    upload_grant.user_id
  )
  RETURNING id INTO new_resume_id;

  PERFORM private.finish_resume_upload(_resume_upload_id, _candidate_id, canonical_path);

  RETURN QUERY SELECT new_resume_id, canonical_path;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_candidate_resume_from_upload(uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_candidate_resume_from_upload(uuid, uuid, text)
  TO authenticated;

COMMIT;

