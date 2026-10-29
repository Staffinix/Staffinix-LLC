BEGIN;
ALTER TABLE public.resumes ADD COLUMN storage_status text NOT NULL DEFAULT 'ready'
  CHECK (storage_status IN ('pending','ready'));
ALTER TABLE private.resume_upload_grants ADD COLUMN content_sha256 text CHECK (content_sha256 ~ '^[0-9a-f]{64}$');
CREATE FUNCTION public.record_validated_resume_upload(_id uuid,_sha256 text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  UPDATE private.resume_upload_grants SET content_sha256=_sha256 WHERE id=_id AND consumed_at IS NULL;
$$;
GRANT SELECT,UPDATE ON private.resume_upload_grants TO service_role;
REVOKE ALL ON FUNCTION public.record_validated_resume_upload(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_validated_resume_upload(uuid,text) TO service_role;
CREATE TABLE private.resume_storage_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('upload','delete','delete-staging')),
  upload_id uuid,
  resume_id uuid,
  tenant_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  final_path text NOT NULL,
  staging_path text,
  mime_type text,
  size_bytes bigint,
  content_sha256 text,
  UNIQUE(upload_id,kind),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.resume_storage_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.resume_storage_jobs FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT ALL ON private.resume_storage_jobs TO service_role;
CREATE INDEX resume_storage_jobs_available_idx ON private.resume_storage_jobs(available_at,created_at);

-- The grant is the durable source of retry inputs, written in the metadata transaction.
CREATE OR REPLACE FUNCTION private.finish_resume_upload(_upload_id uuid,_candidate_id uuid,_final_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE g private.resume_upload_grants; rid uuid;
BEGIN
  UPDATE private.resume_upload_grants SET candidate_id=_candidate_id,final_path=_final_path,consumed_at=now()
  WHERE id=_upload_id AND user_id=auth.uid() AND tenant_id=private.current_tenant_id()
    AND consumed_at IS NULL AND expires_at>now() RETURNING * INTO g;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resume upload cannot be consumed' USING ERRCODE='42501'; END IF;
  IF _final_path IS DISTINCT FROM g.tenant_id::text || '/' || _candidate_id::text || '/' || g.object_id::text || '.' || g.extension
  THEN RAISE EXCEPTION 'Invalid resume destination' USING ERRCODE='22023'; END IF;
  UPDATE public.resumes SET storage_status='pending',is_primary=false,created_at=clock_timestamp()
  WHERE candidate_id=_candidate_id AND tenant_id=g.tenant_id AND file_path=_final_path RETURNING id INTO rid;
  IF g.content_sha256 IS NULL THEN RAISE EXCEPTION 'Resume must be validated before saving'; END IF;
  IF rid IS NULL THEN RAISE EXCEPTION 'Resume not found'; END IF;
  INSERT INTO private.resume_storage_jobs(kind,upload_id,resume_id,tenant_id,candidate_id,final_path,staging_path,mime_type,size_bytes,content_sha256)
  VALUES ('upload',g.id,rid,g.tenant_id,_candidate_id,_final_path,g.staging_path,g.mime_type,g.size_bytes,g.content_sha256);
END $$;

CREATE FUNCTION private.queue_deleted_resume_file() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF OLD.file_path ~ ('^' || OLD.tenant_id::text || '/' || OLD.candidate_id::text || '/[0-9a-f-]{36}[.](pdf|docx)$') THEN
    INSERT INTO private.resume_storage_jobs(kind,resume_id,tenant_id,candidate_id,final_path)
    VALUES ('delete',OLD.id,OLD.tenant_id,OLD.candidate_id,OLD.file_path);
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION private.queue_deleted_resume_file() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER queue_deleted_resume_file AFTER DELETE ON public.resumes
FOR EACH ROW EXECUTE FUNCTION private.queue_deleted_resume_file();

CREATE FUNCTION public.claim_resume_storage_jobs(_upload_id uuid DEFAULT NULL,_limit integer DEFAULT 5)
RETURNS SETOF private.resume_storage_jobs LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  UPDATE private.resume_storage_jobs j SET available_at=now()+interval '10 minutes',lease=gen_random_uuid(),attempts=attempts+1
  WHERE j.id IN (SELECT id FROM private.resume_storage_jobs WHERE available_at<=now()
    AND (_upload_id IS NULL OR upload_id=_upload_id) ORDER BY created_at LIMIT least(greatest(_limit,1),10)
    FOR UPDATE SKIP LOCKED) RETURNING j.*;
$$;

CREATE FUNCTION public.complete_resume_storage_job(_id uuid,_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j private.resume_storage_jobs;
BEGIN
  SELECT * INTO j FROM private.resume_storage_jobs WHERE id=_id AND lease=_lease FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Storage job lease lost'; END IF;
  IF j.kind='upload' THEN
    PERFORM 1 FROM public.candidates WHERE id=j.candidate_id FOR UPDATE;
    IF NOT EXISTS (SELECT 1 FROM public.resumes WHERE id=j.resume_id AND file_path=j.final_path) THEN
      -- A concurrent candidate/resume deletion must not leave a newly uploaded orphan.
      INSERT INTO private.resume_storage_jobs(kind,tenant_id,candidate_id,final_path)
      VALUES ('delete',j.tenant_id,j.candidate_id,j.final_path);
    ELSE
      -- A later upload wins even if an older storage retry finishes last.
      IF NOT EXISTS (SELECT 1 FROM public.resumes r JOIN public.resumes newer ON newer.candidate_id=r.candidate_id
        AND newer.is_primary AND (newer.created_at,newer.id)>(r.created_at,r.id) WHERE r.id=j.resume_id) THEN
        UPDATE public.resumes SET is_primary=false WHERE candidate_id=j.candidate_id AND is_primary;
        UPDATE public.resumes SET is_primary=true WHERE id=j.resume_id;
      END IF;
      UPDATE public.resumes SET storage_status='ready' WHERE id=j.resume_id;
    END IF;
  END IF;
  IF j.kind='upload' AND j.staging_path IS NOT NULL THEN
    INSERT INTO private.resume_storage_jobs(kind,upload_id,tenant_id,candidate_id,final_path)
    VALUES ('delete-staging',j.upload_id,j.tenant_id,j.candidate_id,j.staging_path);
  END IF;
  DELETE FROM private.resume_storage_jobs WHERE id=_id;
  RETURN true;
END $$;
CREATE FUNCTION public.retry_resume_storage_job(_id uuid,_lease uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  UPDATE private.resume_storage_jobs SET lease=NULL,available_at=now()+interval '1 minute' * least(attempts*attempts,60)
  WHERE id=_id AND lease=_lease;
$$;
REVOKE ALL ON FUNCTION public.claim_resume_storage_jobs(uuid,integer),public.complete_resume_storage_job(uuid,uuid),public.retry_resume_storage_job(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_resume_storage_jobs(uuid,integer),public.complete_resume_storage_job(uuid,uuid),public.retry_resume_storage_job(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.create_candidate_graph_from_resume_upload(
  _candidate jsonb,
  _resume_upload_id uuid,
  _skills jsonb DEFAULT '[]'::jsonb,
  _employment jsonb DEFAULT '[]'::jsonb,
  _education jsonb DEFAULT '[]'::jsonb,
  _projects jsonb DEFAULT '[]'::jsonb,
  _certifications jsonb DEFAULT '[]'::jsonb,
  _extracted_text text DEFAULT NULL
)
RETURNS TABLE(candidate_id uuid, resume_path text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  upload_grant record;
  new_candidate_id uuid;
  canonical_path text;
BEGIN
  SELECT * INTO upload_grant
  FROM private.claim_resume_upload(_resume_upload_id);

  SELECT graph.candidate_id INTO new_candidate_id
  FROM public.create_candidate_graph(
    _candidate,
    _skills,
    _employment,
    _education,
    _projects,
    _certifications,
    NULL
  ) AS graph;

  canonical_path := upload_grant.tenant_id::text || '/' || new_candidate_id::text ||
    '/' || upload_grant.object_id::text || '.' || upload_grant.extension;

  INSERT INTO public.resumes (
    tenant_id, candidate_id, file_path, file_name, mime_type, size_bytes,
    is_primary, extracted_text, source, uploaded_by
  ) VALUES (
    upload_grant.tenant_id,
    new_candidate_id,
    canonical_path,
    upload_grant.file_name,
    upload_grant.mime_type,
    upload_grant.size_bytes,
    false,
    _extracted_text,
    CASE WHEN upload_grant.extension = 'pdf' THEN 'pdf' ELSE 'docx' END::public.requirement_source,
    upload_grant.user_id
  );

  PERFORM private.finish_resume_upload(_resume_upload_id, new_candidate_id, canonical_path);
  RETURN QUERY SELECT new_candidate_id, canonical_path;
END;
$$;


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
    false,
    _extracted_text,
    CASE WHEN upload_grant.extension = 'pdf' THEN 'pdf' ELSE 'docx' END::public.requirement_source,
    upload_grant.user_id
  )
  RETURNING id INTO new_resume_id;

  PERFORM private.finish_resume_upload(_resume_upload_id, _candidate_id, canonical_path);

  RETURN QUERY SELECT new_resume_id, canonical_path;
END;
$$;


COMMIT;
