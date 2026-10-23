-- Additive change; existing submission stages and rows are preserved.
BEGIN;
ALTER TABLE public.submissions
  ADD COLUMN interview_type text,
  ADD COLUMN interview_other text,
  ADD CONSTRAINT submissions_interview_type_check CHECK (
    interview_type IS NULL OR interview_type IN ('screening','coding','technical','client','hr','other')
  ),
  ADD CONSTRAINT submissions_interview_other_check CHECK (
    (interview_type = 'other' AND interview_other IS NOT NULL AND char_length(btrim(interview_other)) BETWEEN 1 AND 120)
    OR (interview_type IS DISTINCT FROM 'other' AND interview_other IS NULL)
  );

CREATE FUNCTION private.normalize_submission_interview_details()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.stage <> 'interview'::public.submission_stage THEN
    NEW.interview_type := NULL;
    NEW.interview_other := NULL;
  ELSIF NEW.interview_type IS DISTINCT FROM 'other' THEN
    NEW.interview_other := NULL;
  ELSE
    NEW.interview_other := btrim(NEW.interview_other);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.normalize_submission_interview_details() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_submissions_interview_details
BEFORE INSERT OR UPDATE OF stage, interview_type, interview_other ON public.submissions
FOR EACH ROW EXECUTE FUNCTION private.normalize_submission_interview_details();

CREATE FUNCTION private.record_submission_interview_detail_event()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.submission_events (submission_id, event_type, from_stage, to_stage, actor_id, actor_email, message, metadata)
  VALUES (NEW.id, 'note_added', OLD.stage, NEW.stage, (SELECT auth.uid()),
    NULLIF((SELECT auth.jwt() ->> 'email'), ''),
    'Interview type: ' || coalesce(NEW.interview_type, 'not recorded') ||
      CASE WHEN NEW.interview_type = 'other' THEN ' - ' || NEW.interview_other ELSE '' END,
    jsonb_build_object('interview_type', NEW.interview_type, 'interview_other', NEW.interview_other));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.record_submission_interview_detail_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_submissions_interview_detail_event
AFTER UPDATE OF stage, interview_type, interview_other ON public.submissions
FOR EACH ROW WHEN (NEW.stage = 'interview' AND
  (NEW.interview_type IS DISTINCT FROM OLD.interview_type OR NEW.interview_other IS DISTINCT FROM OLD.interview_other))
EXECUTE FUNCTION private.record_submission_interview_detail_event();
NOTIFY pgrst, 'reload schema';
COMMIT;
