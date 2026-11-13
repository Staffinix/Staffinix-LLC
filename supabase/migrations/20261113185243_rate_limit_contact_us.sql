BEGIN;

-- The contact form is writable by anonymous callers, both through the web
-- server and directly with the publishable key, so the limit must live here.
CREATE INDEX IF NOT EXISTS contact_us_email_created_at_idx
  ON public.contact_us (email, created_at DESC);

CREATE OR REPLACE FUNCTION private.limit_contact_us_submissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  per_email_limit CONSTANT integer := 3;
  global_limit CONSTANT integer := 60;
  window_start CONSTANT timestamptz := now() - interval '1 hour';
BEGIN
  -- Callers may not backdate a row to slide out of the window.
  NEW.created_at := now();

  -- Serialize submissions so concurrent inserts cannot each pass the count.
  PERFORM pg_advisory_xact_lock(hashtextextended('public.contact_us:rate_limit', 0));

  IF (SELECT count(*) FROM public.contact_us
      WHERE email = NEW.email AND created_at > window_start) >= per_email_limit
     OR (SELECT count(*) FROM public.contact_us
         WHERE created_at > window_start) >= global_limit
  THEN
    -- PostgREST maps SQLSTATE PT429 to HTTP 429.
    RAISE EXCEPTION 'Too many contact requests. Please try again later.'
      USING ERRCODE = 'PT429';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.limit_contact_us_submissions() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS contact_us_rate_limit ON public.contact_us;
CREATE TRIGGER contact_us_rate_limit
  BEFORE INSERT ON public.contact_us
  FOR EACH ROW EXECUTE FUNCTION private.limit_contact_us_submissions();

COMMIT;
