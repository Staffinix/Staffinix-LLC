-- Remove exact duplicate indexes reported by the Supabase performance advisor.
-- The equivalent retained indexes continue to cover the same columns and predicates.
DROP INDEX IF EXISTS public.idx_audit_logs_tenant;
DROP INDEX IF EXISTS public.idx_clients_tenant;
DROP INDEX IF EXISTS public.idx_interviews_tenant;
DROP INDEX IF EXISTS public.idx_placements_tenant;
DROP INDEX IF EXISTS public.idx_requirements_tenant;
DROP INDEX IF EXISTS public.resumes_candidate_idx;
DROP INDEX IF EXISTS public.idx_submissions_tenant;
DROP INDEX IF EXISTS public.idx_vendors_tenant;
