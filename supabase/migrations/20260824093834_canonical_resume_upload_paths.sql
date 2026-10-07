BEGIN;

-- Resume uploads are issued by the database, expire quickly, and are bound to
-- the authenticated user and tenant. The browser receives only the opaque id
-- plus a signed upload token; it never chooses a permanent resume path.
CREATE TABLE private.resume_upload_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  object_id uuid NOT NULL DEFAULT gen_random_uuid(),
  extension text NOT NULL CHECK (extension IN ('pdf', 'docx')),
  file_name text NOT NULL CHECK (
    char_length(file_name) BETWEEN 1 AND 200
    AND file_name !~ '[[:cntrl:]]'
    AND position('/' in file_name) = 0
    AND position(chr(92) in file_name) = 0
  ),
  mime_type text NOT NULL CHECK (mime_type IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  CHECK (
    (mime_type = 'application/pdf' AND lower(file_name) LIKE '%.pdf')
    OR (
      mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      AND lower(file_name) LIKE '%.docx'
    )
  ),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  staging_path text NOT NULL UNIQUE,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE,
  final_path text UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    staging_path = tenant_id::text || '/' || user_id::text || '/' || id::text || '.' || extension
  ),
  CHECK (
    (consumed_at IS NULL AND candidate_id IS NULL AND final_path IS NULL)
    OR (consumed_at IS NOT NULL AND candidate_id IS NOT NULL AND final_path IS NOT NULL)
  )
);

CREATE INDEX resume_upload_grants_user_active_idx
ON private.resume_upload_grants(user_id, expires_at)
WHERE consumed_at IS NULL;

ALTER TABLE private.resume_upload_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.resume_upload_grants FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.resume_upload_grants FROM PUBLIC, anon, authenticated;

-- The staging bucket is distinct from permanent resumes, so every object in
-- the resumes bucket can obey the canonical tenant/candidate/object layout.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resume-uploads',
  'resume-uploads',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION private.issue_resume_upload(
  _file_name text,
  _mime_type text,
  _size_bytes bigint
)
RETURNS TABLE(upload_id uuid, staging_path text, file_name text, mime_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_tenant_id uuid := private.current_tenant_id();
  new_id uuid := gen_random_uuid();
  file_extension text;
  safe_file_name text := btrim(_file_name);
BEGIN
  IF actor_id IS NULL OR actor_tenant_id IS NULL OR NOT private.is_active_user() THEN
    RAISE EXCEPTION 'Active authentication is required' USING ERRCODE = '42501';
  END IF;

  IF safe_file_name IS NULL
     OR char_length(safe_file_name) NOT BETWEEN 1 AND 200
     OR safe_file_name ~ '[[:cntrl:]]'
     OR position('/' in safe_file_name) > 0
     OR position(chr(92) in safe_file_name) > 0 THEN
    RAISE EXCEPTION 'Invalid resume file name' USING ERRCODE = '22023';
  END IF;

  file_extension := CASE _mime_type
    WHEN 'application/pdf' THEN 'pdf'
    WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN 'docx'
    ELSE NULL
  END;

  IF file_extension IS NULL
     OR _size_bytes IS NULL
     OR _size_bytes NOT BETWEEN 1 AND 10485760
     OR lower(safe_file_name) NOT LIKE ('%.' || file_extension) THEN
    RAISE EXCEPTION 'Unsupported resume type or size' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  INSERT INTO private.resume_upload_grants (
    id, tenant_id, user_id, extension, file_name, mime_type, size_bytes, staging_path
  ) VALUES (
    new_id,
    actor_tenant_id,
    actor_id,
    file_extension,
    safe_file_name,
    _mime_type,
    _size_bytes,
    actor_tenant_id::text || '/' || actor_id::text || '/' || new_id::text || '.' || file_extension
  )
  RETURNING private.resume_upload_grants.id, private.resume_upload_grants.staging_path,
    private.resume_upload_grants.file_name, private.resume_upload_grants.mime_type;
END;
$$;

CREATE OR REPLACE FUNCTION private.claim_resume_upload(_upload_id uuid)
RETURNS TABLE(
  upload_id uuid,
  tenant_id uuid,
  user_id uuid,
  object_id uuid,
  extension text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  staging_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT private.is_active_user() THEN
    RAISE EXCEPTION 'Active authentication is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT g.id, g.tenant_id, g.user_id, g.object_id, g.extension,
    g.file_name, g.mime_type, g.size_bytes, g.staging_path
  FROM private.resume_upload_grants AS g
  WHERE g.id = _upload_id
    AND g.user_id = (SELECT auth.uid())
    AND g.tenant_id = private.current_tenant_id()
    AND g.consumed_at IS NULL
    AND g.expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resume upload not found, expired, or already consumed'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.finish_resume_upload(
  _upload_id uuid,
  _candidate_id uuid,
  _final_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE private.resume_upload_grants AS g
  SET candidate_id = _candidate_id, final_path = _final_path, consumed_at = now()
  WHERE g.id = _upload_id
    AND g.user_id = (SELECT auth.uid())
    AND g.tenant_id = private.current_tenant_id()
    AND g.consumed_at IS NULL
    AND g.expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resume upload cannot be consumed' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.can_access_resume_staging_path(_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private.resume_upload_grants AS g
    WHERE g.staging_path = _path
      AND g.user_id = (SELECT auth.uid())
      AND g.tenant_id = private.current_tenant_id()
      AND g.expires_at > now()
  );
$$;

REVOKE ALL ON FUNCTION private.issue_resume_upload(text, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.claim_resume_upload(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.finish_resume_upload(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_access_resume_staging_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.issue_resume_upload(text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION private.claim_resume_upload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.finish_resume_upload(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_resume_staging_path(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_resume_upload(
  _file_name text,
  _mime_type text,
  _size_bytes bigint
)
RETURNS TABLE(upload_id uuid, staging_path text, file_name text, mime_type text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM private.issue_resume_upload(_file_name, _mime_type, _size_bytes);
$$;

CREATE OR REPLACE FUNCTION public.authorize_resume_upload(_upload_id uuid)
RETURNS TABLE(
  upload_id uuid,
  file_name text,
  mime_type text,
  size_bytes bigint,
  staging_path text
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT c.upload_id, c.file_name, c.mime_type, c.size_bytes, c.staging_path
  FROM private.claim_resume_upload(_upload_id) AS c;
$$;

REVOKE ALL ON FUNCTION public.issue_resume_upload(text, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.authorize_resume_upload(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_resume_upload(text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_resume_upload(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.is_canonical_resume_path(
  _path text,
  _tenant_id uuid,
  _candidate_id uuid,
  _mime_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE _mime_type
    WHEN 'application/pdf' THEN
      _path ~ (
        '^' || _tenant_id::text || '/' || _candidate_id::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
        E'\\.pdf$'
      )
    WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN
      _path ~ (
        '^' || _tenant_id::text || '/' || _candidate_id::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
        E'\\.docx$'
      )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION private.is_canonical_resume_path(text, uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_canonical_resume_path(text, uuid, uuid, text)
  TO authenticated;

-- A resume row may only contain an exact inline path or a canonical permanent
-- path backed by the caller's live upload grant. This also closes the legacy
-- create_candidate_graph(file_path) route at the database boundary.
CREATE OR REPLACE FUNCTION private.enforce_resume_storage_path()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expected_extension text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.candidate_id IS NOT DISTINCT FROM OLD.candidate_id
     AND NEW.file_path IS NOT DISTINCT FROM OLD.file_path
     AND NEW.mime_type IS NOT DISTINCT FROM OLD.mime_type THEN
    RETURN NEW;
  END IF;

  IF NEW.file_path = 'inline://' || NEW.candidate_id::text THEN
    RETURN NEW;
  END IF;

  expected_extension := CASE NEW.mime_type
    WHEN 'application/pdf' THEN 'pdf'
    WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN 'docx'
    ELSE NULL
  END;

  IF expected_extension IS NULL
     OR NOT private.is_canonical_resume_path(
       NEW.file_path, NEW.tenant_id, NEW.candidate_id, NEW.mime_type
     )
     OR NOT EXISTS (
       SELECT 1
       FROM private.resume_upload_grants AS g
       WHERE g.tenant_id = NEW.tenant_id
         AND g.user_id = (SELECT auth.uid())
         AND g.object_id::text = split_part(split_part(NEW.file_path, '/', 3), '.', 1)
         AND g.extension = expected_extension
         AND g.consumed_at IS NULL
         AND g.expires_at > now()
     ) THEN
    RAISE EXCEPTION 'Resume storage path was not issued by the server'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_resume_storage_path() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_resumes_enforce_storage_path ON public.resumes;
CREATE TRIGGER trg_resumes_enforce_storage_path
BEFORE INSERT OR UPDATE OF tenant_id, candidate_id, file_path, mime_type ON public.resumes
FOR EACH ROW EXECUTE FUNCTION private.enforce_resume_storage_path();

-- This wrapper keeps candidate, children, resume metadata, audit and outbox
-- writes in one PostgreSQL transaction while the permanent path is generated
-- only after the authoritative candidate id exists.
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
    true,
    _extracted_text,
    CASE WHEN upload_grant.extension = 'pdf' THEN 'pdf' ELSE 'docx' END::public.requirement_source,
    upload_grant.user_id
  );

  PERFORM private.finish_resume_upload(_resume_upload_id, new_candidate_id, canonical_path);
  RETURN QUERY SELECT new_candidate_id, canonical_path;
END;
$$;

REVOKE ALL ON FUNCTION public.create_candidate_graph_from_resume_upload(
  jsonb, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_candidate_graph_from_resume_upload(
  jsonb, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text
) TO authenticated;

-- Storage policies enforce both the one-time grant and the permanent resume
-- row. Merely knowing a tenant id or an object path is no longer sufficient.
DROP POLICY IF EXISTS resume_uploads_insert ON storage.objects;
DROP POLICY IF EXISTS resume_uploads_read ON storage.objects;
DROP POLICY IF EXISTS resume_uploads_delete ON storage.objects;
CREATE POLICY resume_uploads_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'resume-uploads'
  AND (SELECT private.can_access_resume_staging_path(name))
);
CREATE POLICY resume_uploads_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'resume-uploads'
  AND (SELECT private.can_access_resume_staging_path(name))
);
CREATE POLICY resume_uploads_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'resume-uploads'
  AND owner_id = (SELECT auth.uid())::text
  AND (SELECT private.can_access_resume_staging_path(name))
);

DROP POLICY IF EXISTS resumes_bucket_read ON storage.objects;
DROP POLICY IF EXISTS resumes_bucket_insert ON storage.objects;
DROP POLICY IF EXISTS resumes_bucket_update ON storage.objects;
DROP POLICY IF EXISTS resumes_bucket_delete ON storage.objects;

CREATE POLICY resumes_bucket_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'resumes'
  AND EXISTS (
    SELECT 1 FROM public.resumes AS r
    WHERE r.file_path = name
      AND (
        r.tenant_id = private.current_tenant_id()
        OR (SELECT private.is_platform_admin())
      )
      AND private.is_canonical_resume_path(
        r.file_path, r.tenant_id, r.candidate_id, r.mime_type
      )
  )
);
CREATE POLICY resumes_bucket_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'resumes'
  AND EXISTS (
    SELECT 1 FROM public.resumes AS r
    WHERE r.file_path = name
      AND r.tenant_id = private.current_tenant_id()
      AND r.uploaded_by = (SELECT auth.uid())
      AND private.is_canonical_resume_path(
        r.file_path, r.tenant_id, r.candidate_id, r.mime_type
      )
  )
);
CREATE POLICY resumes_bucket_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'resumes'
  AND EXISTS (
    SELECT 1 FROM public.resumes AS r
    WHERE r.file_path = name
      AND r.tenant_id = private.current_tenant_id()
      AND private.is_canonical_resume_path(
        r.file_path, r.tenant_id, r.candidate_id, r.mime_type
      )
  )
)
WITH CHECK (
  bucket_id = 'resumes'
  AND EXISTS (
    SELECT 1 FROM public.resumes AS r
    WHERE r.file_path = name
      AND r.tenant_id = private.current_tenant_id()
      AND private.is_canonical_resume_path(
        r.file_path, r.tenant_id, r.candidate_id, r.mime_type
      )
  )
);
CREATE POLICY resumes_bucket_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'resumes'
  AND (SELECT private.is_admin())
  AND EXISTS (
    SELECT 1 FROM public.resumes AS r
    WHERE r.file_path = name
      AND r.tenant_id = private.current_tenant_id()
      AND private.is_canonical_resume_path(
        r.file_path, r.tenant_id, r.candidate_id, r.mime_type
      )
  )
);

COMMIT;
