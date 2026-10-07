ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS linkedin_id text,
  ADD COLUMN IF NOT EXISTS contact_role text;

COMMENT ON COLUMN public.vendors.linkedin_id IS
  'LinkedIn profile URL or public LinkedIn identifier for the vendor contact.';
COMMENT ON COLUMN public.vendors.contact_role IS
  'Job title or role of the primary vendor contact.';
