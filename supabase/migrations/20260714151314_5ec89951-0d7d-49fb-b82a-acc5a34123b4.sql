
-- Pin search_path on the trigger fn
ALTER FUNCTION public.tg_touch_updated_at() SET search_path = public;

-- Revoke public EXECUTE on SECURITY DEFINER functions
-- (they'll still be callable inside RLS policies since policies run as the
--  policy owner, and from server functions using service_role)
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO service_role;
