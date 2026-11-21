-- Emails accepted by a recruiter's Smart Email rules become requirements that
-- record who sent them. The sender is copied from the stored email, never from input.
BEGIN;

ALTER TABLE public.requirements
  ADD COLUMN source_email_id uuid UNIQUE REFERENCES public.selected_emails(id) ON DELETE SET NULL,
  ADD COLUMN source_email_sender_name text,
  ADD COLUMN source_email_sender_address text,
  ADD COLUMN source_email_received_at timestamptz;

-- Marks an email as handled, so deleting its requirement does not recreate it on the next sync.
ALTER TABLE public.selected_emails ADD COLUMN requirement_imported_at timestamptz;

CREATE OR REPLACE FUNCTION private.protect_requirement_email_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND (
    (TG_OP = 'INSERT' AND (
      NEW.source_email_id IS NOT NULL OR NEW.source_email_sender_name IS NOT NULL
      OR NEW.source_email_sender_address IS NOT NULL OR NEW.source_email_received_at IS NOT NULL
    ))
    OR (TG_OP = 'UPDATE' AND (
      NEW.source_email_id IS DISTINCT FROM OLD.source_email_id
      OR NEW.source_email_sender_name IS DISTINCT FROM OLD.source_email_sender_name
      OR NEW.source_email_sender_address IS DISTINCT FROM OLD.source_email_sender_address
      OR NEW.source_email_received_at IS DISTINCT FROM OLD.source_email_received_at
    ))
  ) THEN
    RAISE EXCEPTION 'Requirement email source cannot be edited' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.protect_requirement_email_source() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_requirements_protect_email_source
  BEFORE INSERT OR UPDATE ON public.requirements
  FOR EACH ROW EXECUTE FUNCTION private.protect_requirement_email_source();

CREATE OR REPLACE FUNCTION public.create_requirement_from_email(
  _selected_email_id uuid,
  _description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  mail public.selected_emails;
  clean_title text;
  created_id uuid;
BEGIN
  -- Scheduled sync runs with the service role and has no end-user JWT.
  IF actor_id IS NULL AND (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT e.* INTO mail FROM public.selected_emails AS e WHERE e.id = _selected_email_id;
  IF mail.id IS NULL OR (
    actor_id IS NOT NULL
    AND (mail.user_id IS DISTINCT FROM actor_id OR NOT (SELECT private.is_l4_recruiter()))
  ) THEN
    RAISE EXCEPTION 'Email not found or access denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.selected_emails AS e
  SET requirement_imported_at = statement_timestamp()
  WHERE e.id = mail.id AND e.requirement_imported_at IS NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  clean_title := left(btrim(regexp_replace(COALESCE(mail.subject, ''), '^\s*((re|fw|fwd)\s*:\s*)+', '', 'i')), 200);
  IF clean_title = '' THEN
    clean_title := 'Requirement from ' || COALESCE(NULLIF(btrim(mail.sender_name), ''), mail.sender_email);
  END IF;

  INSERT INTO public.requirements (
    title, description, source, tenant_id, created_by, source_email_id,
    source_email_sender_name, source_email_sender_address, source_email_received_at
  ) VALUES (
    clean_title,
    NULLIF(btrim(left(COALESCE(_description, mail.preview, ''), 20000)), ''),
    'email'::public.requirement_source,
    mail.tenant_id,
    mail.user_id,
    mail.id,
    NULLIF(btrim(mail.sender_name), ''),
    mail.sender_email,
    mail.received_at
  )
  RETURNING id INTO created_id;

  RETURN created_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_requirement_from_email(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_requirement_from_email(uuid, text) TO authenticated, service_role;

COMMIT;
