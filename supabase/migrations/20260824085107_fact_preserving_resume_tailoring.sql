-- Resume tailoring is an approval workflow, not a content generator.
-- A source resume must be explicitly verified before it can back an immutable draft.

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_facts_hash text;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'resumes_verification_status_check'
      AND conrelid = 'public.resumes'::regclass
  ) THEN
    ALTER TABLE public.resumes
      ADD CONSTRAINT resumes_verification_status_check
      CHECK (
        verification_status IN ('pending', 'verified', 'rejected')
      );
  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'resumes_verification_metadata_check'
      AND conrelid = 'public.resumes'::regclass
  ) THEN
    ALTER TABLE public.resumes
      ADD CONSTRAINT resumes_verification_metadata_check
      CHECK (
        (
          verification_status = 'verified'
          AND verified_by IS NOT NULL
          AND verified_at IS NOT NULL
          AND NULLIF(BTRIM(verified_facts_hash), '') IS NOT NULL
        )
        OR
        (
          verification_status <> 'verified'
          AND verified_by IS NULL
          AND verified_at IS NULL
          AND verified_facts_hash IS NULL
        )
      );
  END IF;
END
$$;


CREATE INDEX IF NOT EXISTS resumes_verified_candidate_idx
  ON public.resumes(candidate_id, is_primary DESC, created_at DESC)
  WHERE verification_status = 'verified';


-- Enforce resume verification metadata.
CREATE OR REPLACE FUNCTION private.enforce_resume_verification_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN

  -- Changing the document or its extracted text invalidates prior review.
  IF TG_OP = 'UPDATE'
     AND OLD.verification_status = 'verified'
     AND (
       NEW.file_path IS DISTINCT FROM OLD.file_path
       OR NEW.file_name IS DISTINCT FROM OLD.file_name
       OR NEW.extracted_text IS DISTINCT FROM OLD.extracted_text
     )
  THEN
    NEW.verification_status := 'pending';
  END IF;


  -- Handle INSERT or a change in verification status.
  --
  -- Avoid using a CASE expression here because this trigger function
  -- runs under an empty search_path and the simpler boolean expression
  -- is both clearer and safer for PostgreSQL's PL/pgSQL parser.
  IF TG_OP = 'INSERT'
     OR (
       TG_OP = 'UPDATE'
       AND NEW.verification_status IS DISTINCT FROM OLD.verification_status
     )
  THEN

    IF NEW.verification_status = 'verified' THEN

      IF (SELECT auth.uid()) IS NULL THEN
        RAISE EXCEPTION
          'A signed-in reviewer is required to verify a resume';
      END IF;


      IF NULLIF(
        BTRIM(COALESCE(NEW.extracted_text, '')),
        ''
      ) IS NULL THEN
        RAISE EXCEPTION
          'A resume cannot be verified without extracted source text';
      END IF;


      IF NULLIF(
        BTRIM(COALESCE(NEW.verified_facts_hash, '')),
        ''
      ) IS NULL THEN
        RAISE EXCEPTION
          'A resume cannot be verified without a structured-facts hash';
      END IF;


      NEW.verified_by := (SELECT auth.uid());
      NEW.verified_at := clock_timestamp();

    ELSE

      NEW.verified_by := NULL;
      NEW.verified_at := NULL;
      NEW.verified_facts_hash := NULL;

    END IF;


  ELSIF TG_OP = 'UPDATE'
        AND (
          NEW.verified_by IS DISTINCT FROM OLD.verified_by
          OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
          OR NEW.verified_facts_hash IS DISTINCT FROM OLD.verified_facts_hash
        )
  THEN

    RAISE EXCEPTION
      'Resume verification metadata is immutable';

  END IF;


  RETURN NEW;
END
$$;


DROP TRIGGER IF EXISTS resumes_verification_metadata
ON public.resumes;


CREATE TRIGGER resumes_verification_metadata
BEFORE INSERT OR UPDATE
ON public.resumes
FOR EACH ROW
EXECUTE FUNCTION private.enforce_resume_verification_metadata();


-- Persist the exact source snapshot and deterministic validation result used
-- for each tailored version. Approved versions are immutable evidence.

ALTER TABLE public.resume_versions
  ADD COLUMN IF NOT EXISTS source_resume_id uuid
    REFERENCES public.resumes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS source_facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS claim_validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS approved_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;


DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'resume_versions_status_check'
      AND conrelid = 'public.resume_versions'::regclass
  ) THEN

    ALTER TABLE public.resume_versions
      ADD CONSTRAINT resume_versions_status_check
      CHECK (
        status IN ('draft', 'approved', 'rejected')
      );

  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'resume_versions_approval_metadata_check'
      AND conrelid = 'public.resume_versions'::regclass
  ) THEN

    ALTER TABLE public.resume_versions
      ADD CONSTRAINT resume_versions_approval_metadata_check
      CHECK (
        (
          status = 'approved'
          AND approved_by IS NOT NULL
          AND approved_at IS NOT NULL
          AND claim_validation @> '{"valid": true}'::jsonb
        )
        OR
        (
          status <> 'approved'
          AND approved_by IS NULL
          AND approved_at IS NULL
        )
      );

  END IF;

END
$$;


CREATE INDEX IF NOT EXISTS resume_versions_source_resume_id_idx
  ON public.resume_versions(source_resume_id);


CREATE INDEX IF NOT EXISTS resume_versions_candidate_requirement_status_idx
  ON public.resume_versions(
    candidate_id,
    requirement_id,
    status,
    created_at DESC
  );


CREATE INDEX IF NOT EXISTS resume_versions_approved_by_idx
  ON public.resume_versions(approved_by)
  WHERE approved_by IS NOT NULL;


-- A version's evidence and rendered content cannot be edited after creation.
-- Reviewers may only move a draft to an approved or rejected terminal state.

CREATE OR REPLACE FUNCTION private.enforce_resume_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN

  IF TG_OP = 'INSERT' THEN

    IF NEW.status <> 'draft'
       OR NEW.approved_by IS NOT NULL
       OR NEW.approved_at IS NOT NULL
    THEN
      RAISE EXCEPTION
        'Resume versions must be created as unapproved drafts';
    END IF;


    -- Generic uploaded versions may have neither relationship.
    -- A tailored version must have the complete evidence set;
    -- partial evidence is never accepted.
    IF NEW.source_resume_id IS NOT NULL
       OR NEW.requirement_id IS NOT NULL
    THEN

      IF NEW.source_resume_id IS NULL
         OR NEW.requirement_id IS NULL
         OR NEW.source_hash IS NULL
         OR NOT (
           NEW.claim_validation @> '{"valid": true}'::jsonb
         )
      THEN
        RAISE EXCEPTION
          'Resume version is missing verified source evidence';
      END IF;

    END IF;


    RETURN NEW;
  END IF;


  IF NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
     OR NEW.requirement_id IS DISTINCT FROM OLD.requirement_id
     OR NEW.source_resume_id IS DISTINCT FROM OLD.source_resume_id
     OR NEW.version_no IS DISTINCT FROM OLD.version_no
     OR NEW.file_path IS DISTINCT FROM OLD.file_path
     OR NEW.tailored_summary IS DISTINCT FROM OLD.tailored_summary
     OR NEW.tailored_content IS DISTINCT FROM OLD.tailored_content
     OR NEW.ats_score IS DISTINCT FROM OLD.ats_score
     OR NEW.match_score IS DISTINCT FROM OLD.match_score
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.source_facts IS DISTINCT FROM OLD.source_facts
     OR NEW.claim_validation IS DISTINCT FROM OLD.claim_validation
     OR NEW.source_hash IS DISTINCT FROM OLD.source_hash
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN

    RAISE EXCEPTION
      'Tailored resume evidence is immutable; create a new version instead';

  END IF;


  IF OLD.status <> 'draft'
     OR NEW.status NOT IN ('approved', 'rejected')
  THEN

    RAISE EXCEPTION
      'Only a draft can be approved or rejected';

  END IF;


  IF NEW.status = 'approved' THEN

    NEW.approved_by := (SELECT auth.uid());
    NEW.approved_at := clock_timestamp();

    IF NEW.approved_by IS NULL THEN
      RAISE EXCEPTION
        'A signed-in reviewer is required to approve a resume';
    END IF;

  ELSE

    NEW.approved_by := NULL;
    NEW.approved_at := NULL;

  END IF;


  RETURN NEW;
END
$$;


DROP TRIGGER IF EXISTS resume_versions_immutability
ON public.resume_versions;


CREATE TRIGGER resume_versions_immutability
BEFORE INSERT OR UPDATE
ON public.resume_versions
FOR EACH ROW
EXECUTE FUNCTION private.enforce_resume_version_immutability();


-- Replace the broad write policy so a forged requirement or source resume ID
-- cannot cross a tenant/candidate boundary.

DROP POLICY IF EXISTS resume_versions_manage_authorized
ON public.resume_versions;


CREATE POLICY resume_versions_insert_fact_preserving
ON public.resume_versions
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND status = 'draft'

  AND EXISTS (
    SELECT 1
    FROM public.candidates c
    WHERE c.id = resume_versions.candidate_id
      AND c.tenant_id = (SELECT private.current_tenant_id())
      AND (
        c.created_by = (SELECT auth.uid())
        OR c.assigned_to = (SELECT auth.uid())
        OR (SELECT private.is_admin())
      )
  )

  AND (
    (
      resume_versions.requirement_id IS NULL
      AND resume_versions.source_resume_id IS NULL
    )
    OR
    (
      EXISTS (
        SELECT 1
        FROM public.requirements r
        JOIN public.candidates c
          ON c.id = resume_versions.candidate_id
        WHERE r.id = resume_versions.requirement_id
          AND r.tenant_id = c.tenant_id
          AND r.tenant_id = (SELECT private.current_tenant_id())
      )

      AND EXISTS (
        SELECT 1
        FROM public.resumes s
        WHERE s.id = resume_versions.source_resume_id
          AND s.candidate_id = resume_versions.candidate_id
          AND s.tenant_id = (SELECT private.current_tenant_id())
          AND s.verification_status = 'verified'
      )
    )
  )
);


CREATE POLICY resume_versions_review_fact_preserving
ON public.resume_versions
FOR UPDATE
TO authenticated
USING (
  status = 'draft'
  AND EXISTS (
    SELECT 1
    FROM public.candidates c
    WHERE c.id = resume_versions.candidate_id
      AND c.tenant_id = (SELECT private.current_tenant_id())
      AND (
        c.created_by = (SELECT auth.uid())
        OR c.assigned_to = (SELECT auth.uid())
        OR (SELECT private.is_admin())
      )
  )
)
WITH CHECK (
  status IN ('approved', 'rejected')
  AND EXISTS (
    SELECT 1
    FROM public.candidates c
    WHERE c.id = resume_versions.candidate_id
      AND c.tenant_id = (SELECT private.current_tenant_id())
      AND (
        c.created_by = (SELECT auth.uid())
        OR c.assigned_to = (SELECT auth.uid())
        OR (SELECT private.is_admin())
      )
  )
);


CREATE POLICY resume_versions_delete_unapproved
ON public.resume_versions
FOR DELETE
TO authenticated
USING (
  status <> 'approved'
  AND EXISTS (
    SELECT 1
    FROM public.candidates c
    WHERE c.id = resume_versions.candidate_id
      AND c.tenant_id = (SELECT private.current_tenant_id())
      AND (
        c.created_by = (SELECT auth.uid())
        OR c.assigned_to = (SELECT auth.uid())
        OR (SELECT private.is_admin())
      )
  )
);


-- Application checks provide clear errors, while this trigger is the final
-- integrity boundary for direct PostgREST/database writes.

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

    SELECT *
    INTO approved_version
    FROM public.resume_versions rv
    WHERE rv.id = NEW.resume_version_id;


    IF approved_version.id IS NULL
       OR approved_version.status <> 'approved'
       OR approved_version.candidate_id <> NEW.candidate_id
       OR approved_version.requirement_id IS DISTINCT FROM NEW.requirement_id
       OR NOT (
         approved_version.claim_validation @> '{"valid": true}'::jsonb
       )
    THEN

      RAISE EXCEPTION
        'Submission requires an approved fact-validated resume for this candidate and requirement';

    END IF;

  END IF;


  IF NEW.stage <> 'draft'
     AND NEW.resume_version_id IS NULL
     AND (
       TG_OP = 'INSERT'
       OR (
         TG_OP = 'UPDATE'
         AND OLD.stage = 'draft'
         AND NEW.stage <> OLD.stage
       )
     )
  THEN

    RAISE EXCEPTION
      'A submission cannot leave draft without an approved tailored resume';

  END IF;


  RETURN NEW;
END
$$;


DROP TRIGGER IF EXISTS submissions_require_approved_resume
ON public.submissions;


CREATE TRIGGER submissions_require_approved_resume
BEFORE INSERT OR UPDATE
ON public.submissions
FOR EACH ROW
EXECUTE FUNCTION private.enforce_submission_resume_approval();


REVOKE EXECUTE
ON FUNCTION private.enforce_resume_verification_metadata()
FROM PUBLIC, anon, authenticated;


REVOKE EXECUTE
ON FUNCTION private.enforce_resume_version_immutability()
FROM PUBLIC, anon, authenticated;


REVOKE EXECUTE
ON FUNCTION private.enforce_submission_resume_approval()
FROM PUBLIC, anon, authenticated;