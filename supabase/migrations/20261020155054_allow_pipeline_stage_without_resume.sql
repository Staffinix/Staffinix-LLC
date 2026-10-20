CREATE OR REPLACE FUNCTION private.enforce_submission_resume_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  approved_version public.resume_versions%ROWTYPE;
BEGIN
  IF NEW.resume_version_id IS NOT NULL THEN
    SELECT * INTO approved_version
    FROM public.resume_versions rv WHERE rv.id = NEW.resume_version_id;
    IF approved_version.id IS NULL
       OR approved_version.status <> 'approved'
       OR approved_version.candidate_id <> NEW.candidate_id
       OR approved_version.requirement_id IS DISTINCT FROM NEW.requirement_id
       OR NOT (approved_version.claim_validation @> '{"valid": true}'::jsonb)
    THEN
      RAISE EXCEPTION 'Submission requires an approved fact-validated resume for this candidate and requirement';
    END IF;
  END IF;

  -- Existing pipeline records may advance without attaching a tailored document.
  -- Keep the separate initial-submission rule unchanged.
  IF TG_OP = 'INSERT' AND NEW.stage <> 'draft' AND NEW.resume_version_id IS NULL THEN
    RAISE EXCEPTION 'A new non-draft submission requires an approved tailored resume';
  END IF;
  RETURN NEW;
END
$$;
