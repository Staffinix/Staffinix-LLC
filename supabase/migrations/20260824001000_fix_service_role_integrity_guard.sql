BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_tenant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_tenant uuid := private.current_tenant_id();
  related_tenant uuid;
BEGIN
  -- Trusted service-role calls have no end-user JWT. Normal authenticated
  -- requests always have auth.uid() and must have an active tenant.
  IF current_tenant IS NULL AND (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Changing tenant ownership is not permitted';
  END IF;

  IF current_tenant IS NULL OR NEW.tenant_id IS DISTINCT FROM current_tenant THEN
    RAISE EXCEPTION 'Invalid tenant ownership';
  END IF;

  IF TG_TABLE_NAME = 'candidates' THEN
    IF NEW.assigned_to IS NOT NULL THEN
      SELECT tenant_id INTO related_tenant FROM public.profiles WHERE id = NEW.assigned_to;
      IF related_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Assigned user belongs to another tenant'; END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'requirements' THEN
    IF NEW.client_id IS NOT NULL THEN
      SELECT tenant_id INTO related_tenant FROM public.clients WHERE id = NEW.client_id;
      IF related_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Client belongs to another tenant'; END IF;
    END IF;
    IF NEW.vendor_id IS NOT NULL THEN
      SELECT tenant_id INTO related_tenant FROM public.vendors WHERE id = NEW.vendor_id;
      IF related_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Vendor belongs to another tenant'; END IF;
    END IF;
    IF NEW.assigned_to IS NOT NULL THEN
      SELECT tenant_id INTO related_tenant FROM public.profiles WHERE id = NEW.assigned_to;
      IF related_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Assigned user belongs to another tenant'; END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'resumes' THEN
    SELECT tenant_id INTO related_tenant FROM public.candidates WHERE id = NEW.candidate_id;
    IF related_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Resume candidate belongs to another tenant'; END IF;

  ELSIF TG_TABLE_NAME = 'submissions' THEN
    SELECT tenant_id INTO related_tenant FROM public.requirements WHERE id = NEW.requirement_id;
    IF related_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Requirement belongs to another tenant'; END IF;
    SELECT tenant_id INTO related_tenant FROM public.candidates WHERE id = NEW.candidate_id;
    IF related_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Candidate belongs to another tenant'; END IF;
    IF NEW.client_id IS NOT NULL THEN
      SELECT tenant_id INTO related_tenant FROM public.clients WHERE id = NEW.client_id;
      IF related_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Client belongs to another tenant'; END IF;
    END IF;
    IF NEW.vendor_id IS NOT NULL THEN
      SELECT tenant_id INTO related_tenant FROM public.vendors WHERE id = NEW.vendor_id;
      IF related_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Vendor belongs to another tenant'; END IF;
    END IF;
    IF NEW.resume_version_id IS NOT NULL THEN
      SELECT c.tenant_id INTO related_tenant FROM public.resume_versions rv
      JOIN public.candidates c ON c.id = rv.candidate_id
      WHERE rv.id = NEW.resume_version_id;
      IF related_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Resume version belongs to another tenant'; END IF;
    END IF;

  ELSIF TG_TABLE_NAME IN ('interviews','placements') THEN
    SELECT tenant_id INTO related_tenant FROM public.submissions WHERE id = NEW.submission_id;
    IF related_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Submission belongs to another tenant'; END IF;

    IF TG_TABLE_NAME = 'placements' THEN
      SELECT tenant_id INTO related_tenant FROM public.candidates WHERE id = NEW.candidate_id;
      IF related_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Candidate belongs to another tenant'; END IF;
      SELECT tenant_id INTO related_tenant FROM public.requirements WHERE id = NEW.requirement_id;
      IF related_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'Requirement belongs to another tenant'; END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_tenant_integrity() FROM PUBLIC;

COMMIT;
