BEGIN;

-- The legacy public wrapper is intentionally unavailable to authenticated
-- clients, but older tenant_id defaults still invoked it. Use the private,
-- caller-bound helper already granted for RLS evaluation so inserts can
-- resolve the active tenant without reopening a public RPC surface.
ALTER TABLE public.api_keys ALTER COLUMN tenant_id SET DEFAULT private.current_tenant_id();
ALTER TABLE public.audit_logs ALTER COLUMN tenant_id SET DEFAULT private.current_tenant_id();
ALTER TABLE public.candidates ALTER COLUMN tenant_id SET DEFAULT private.current_tenant_id();
ALTER TABLE public.clients ALTER COLUMN tenant_id SET DEFAULT private.current_tenant_id();
ALTER TABLE public.interviews ALTER COLUMN tenant_id SET DEFAULT private.current_tenant_id();
ALTER TABLE public.placements ALTER COLUMN tenant_id SET DEFAULT private.current_tenant_id();
ALTER TABLE public.profiles ALTER COLUMN tenant_id SET DEFAULT private.current_tenant_id();
ALTER TABLE public.requirements ALTER COLUMN tenant_id SET DEFAULT private.current_tenant_id();
ALTER TABLE public.submissions ALTER COLUMN tenant_id SET DEFAULT private.current_tenant_id();
ALTER TABLE public.vendors ALTER COLUMN tenant_id SET DEFAULT private.current_tenant_id();
ALTER TABLE public.workflow_settings ALTER COLUMN tenant_id SET DEFAULT private.current_tenant_id();

COMMIT;
