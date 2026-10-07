BEGIN;

-- Supabase may install this event-trigger function outside the repository's
-- migrations. Event triggers invoke it internally; browser-facing database
-- roles never need direct EXECUTE permission on this SECURITY DEFINER function.
DO $migration$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END;
$migration$;

COMMIT;
