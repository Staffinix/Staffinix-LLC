BEGIN;

CREATE OR REPLACE FUNCTION private.record_submission_created_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.submission_events (
    submission_id,
    event_type,
    to_stage,
    actor_id,
    actor_email,
    message
  )
  VALUES (
    NEW.id,
    'created'::public.submission_event_type,
    NEW.stage,
    (SELECT auth.uid()),
    NULLIF((SELECT auth.jwt() ->> 'email'), ''),
    CASE
      WHEN NEW.stage = 'draft'::public.submission_stage THEN 'Draft created'
      ELSE 'Submission created and submitted'
    END
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.record_submission_stage_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  event_name public.submission_event_type;
BEGIN
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NEW;
  END IF;

  event_name := CASE NEW.stage
    WHEN 'rejected'::public.submission_stage THEN 'rejected'::public.submission_event_type
    WHEN 'withdrawn'::public.submission_stage THEN 'withdrawn'::public.submission_event_type
    WHEN 'offer'::public.submission_stage THEN 'offer_extended'::public.submission_event_type
    WHEN 'hired'::public.submission_stage THEN 'placed'::public.submission_event_type
    ELSE 'stage_changed'::public.submission_event_type
  END;

  INSERT INTO public.submission_events (
    submission_id,
    event_type,
    from_stage,
    to_stage,
    actor_id,
    actor_email,
    message
  )
  VALUES (
    NEW.id,
    event_name,
    OLD.stage,
    NEW.stage,
    (SELECT auth.uid()),
    NULLIF((SELECT auth.jwt() ->> 'email'), ''),
    CASE
      WHEN NEW.stage = 'rejected'::public.submission_stage THEN NEW.rejected_reason
      ELSE NULL
    END
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.record_submission_created_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.record_submission_stage_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_submissions_record_created ON public.submissions;
CREATE TRIGGER trg_submissions_record_created
AFTER INSERT ON public.submissions
FOR EACH ROW
EXECUTE FUNCTION private.record_submission_created_event();

DROP TRIGGER IF EXISTS trg_submissions_record_stage_change ON public.submissions;
CREATE TRIGGER trg_submissions_record_stage_change
AFTER UPDATE OF stage ON public.submissions
FOR EACH ROW
WHEN (OLD.stage IS DISTINCT FROM NEW.stage)
EXECUTE FUNCTION private.record_submission_stage_event();

COMMIT;
