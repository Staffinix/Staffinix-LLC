BEGIN;

-- The later 22:00 and 23:00 security migrations require resumes.tenant_id.
-- Add and populate it before those migrations execute.
ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE public.resumes AS r
SET tenant_id = c.tenant_id
FROM public.candidates AS c
WHERE r.tenant_id IS NULL
  AND r.candidate_id = c.id
  AND c.tenant_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.resumes WHERE tenant_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot continue security hardening: every resume must have tenant ownership.';
  END IF;
END $$;

ALTER TABLE public.resumes DROP CONSTRAINT IF EXISTS resumes_tenant_id_fkey;
ALTER TABLE public.resumes
  ADD CONSTRAINT resumes_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.resumes ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS resumes_tenant_id_idx ON public.resumes(tenant_id);

COMMIT;
