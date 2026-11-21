-- A tailored resume can target either a requirement or a technology + domain.
-- Both paths keep the same evidence, immutability and human-approval rules.
BEGIN;

ALTER TABLE public.resume_versions
  ADD COLUMN target_technology text,
  ADD COLUMN target_domain text,
  ADD CONSTRAINT resume_versions_target_pair_check
    CHECK ((target_technology IS NULL) = (target_domain IS NULL)),
  ADD CONSTRAINT resume_versions_single_target_check
    CHECK (requirement_id IS NULL OR target_technology IS NULL);

CREATE OR REPLACE FUNCTION private.enforce_resume_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft'
       OR NEW.approved_by IS NOT NULL
       OR NEW.approved_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'Resume versions must be created as unapproved drafts';
    END IF;

    -- Generic uploaded versions have no relationships. A tailored version must
    -- have a target and the complete evidence set; partial evidence is rejected.
    IF NEW.source_resume_id IS NOT NULL
       OR NEW.requirement_id IS NOT NULL
       OR NEW.target_technology IS NOT NULL
    THEN
      IF NEW.source_resume_id IS NULL
         OR (NEW.requirement_id IS NULL AND NEW.target_technology IS NULL)
         OR NEW.source_hash IS NULL
         OR NOT (NEW.claim_validation @> '{"valid": true}'::jsonb)
      THEN
        RAISE EXCEPTION 'Resume version is missing verified source evidence';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
     OR NEW.requirement_id IS DISTINCT FROM OLD.requirement_id
     OR NEW.target_technology IS DISTINCT FROM OLD.target_technology
     OR NEW.target_domain IS DISTINCT FROM OLD.target_domain
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
    RAISE EXCEPTION 'Tailored resume evidence is immutable; create a new version instead';
  END IF;

  IF OLD.status <> 'draft' OR NEW.status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Only a draft can be approved or rejected';
  END IF;

  IF NEW.status = 'approved' THEN
    NEW.approved_by := (SELECT auth.uid());
    NEW.approved_at := clock_timestamp();
    IF NEW.approved_by IS NULL THEN
      RAISE EXCEPTION 'A signed-in reviewer is required to approve a resume';
    END IF;
  ELSE
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;

  RETURN NEW;
END
$$;

ALTER POLICY resume_versions_insert_fact_preserving ON public.resume_versions
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND status = 'draft'
  AND EXISTS (
    SELECT 1 FROM public.candidates AS c
    WHERE c.id = resume_versions.candidate_id
      AND c.tenant_id = (SELECT private.current_tenant_id())
      AND private.can_work_on_candidate(c.created_by, c.assigned_to)
  )
  AND (
    (requirement_id IS NULL AND source_resume_id IS NULL AND target_technology IS NULL)
    OR (
      (
        target_technology IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.requirements AS r
          JOIN public.candidates AS c ON c.id = resume_versions.candidate_id
          WHERE r.id = resume_versions.requirement_id
            AND r.tenant_id = c.tenant_id
            AND r.tenant_id = (SELECT private.current_tenant_id())
        )
      )
      AND EXISTS (
        SELECT 1 FROM public.resumes AS s
        WHERE s.id = resume_versions.source_resume_id
          AND s.candidate_id = resume_versions.candidate_id
          AND s.tenant_id = (SELECT private.current_tenant_id())
          AND s.verification_status = 'verified'
      )
    )
  )
);

COMMIT;
