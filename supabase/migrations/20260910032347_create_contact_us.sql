BEGIN;

CREATE TABLE public.contact_us (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone_number text NOT NULL,
  email text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_us_name_length_check
    CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  CONSTRAINT contact_us_phone_format_check
    CHECK (phone_number ~ '^[0-9+(). -]{7,30}$'),
  CONSTRAINT contact_us_email_format_check
    CHECK (char_length(email) <= 254 AND email = lower(btrim(email)) AND position('@' IN email) > 1),
  CONSTRAINT contact_us_description_length_check
    CHECK (char_length(btrim(description)) BETWEEN 10 AND 2000)
);

CREATE INDEX contact_us_created_at_idx ON public.contact_us (created_at DESC);

ALTER TABLE public.contact_us ENABLE ROW LEVEL SECURITY;

-- The form is intentionally public, but public callers can only create a
-- validated message. There is deliberately no policy for SELECT, UPDATE, or
-- DELETE, so contact details cannot be enumerated or modified from the web.
GRANT INSERT ON public.contact_us TO anon, authenticated;

CREATE POLICY contact_us_public_insert ON public.contact_us
FOR INSERT TO anon, authenticated
WITH CHECK (
  char_length(btrim(name)) BETWEEN 2 AND 120
  AND phone_number ~ '^[0-9+(). -]{7,30}$'
  AND char_length(email) <= 254
  AND email = lower(btrim(email))
  AND position('@' IN email) > 1
  AND char_length(btrim(description)) BETWEEN 10 AND 2000
);

COMMIT;
