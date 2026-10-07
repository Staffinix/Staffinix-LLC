
DO $$ BEGIN
  CREATE TYPE public.crm_status AS ENUM ('prospect','active','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_tier AS ENUM ('a','b','c');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS status public.crm_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS tier public.crm_tier,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS msa_signed_at date;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS status public.crm_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS tier public.crm_tier,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS payment_terms_days integer,
  ADD COLUMN IF NOT EXISTS msa_signed_at date;

CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients (status);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON public.vendors (status);
