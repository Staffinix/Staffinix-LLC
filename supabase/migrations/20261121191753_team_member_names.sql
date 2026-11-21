-- Recruiters cannot read colleagues' profiles. This exposes only the display name
-- of people in the caller's own company, for "Created by" and recruiter columns.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_team_member_names(_user_ids uuid[])
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, COALESCE(NULLIF(btrim(p.full_name), ''), 'Team member')
  FROM public.profiles AS p
  WHERE p.id = ANY (_user_ids[1:500])
    AND p.tenant_id = (SELECT private.current_tenant_id())
    AND (SELECT private.is_active_user());
$$;

REVOKE ALL ON FUNCTION public.get_team_member_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_member_names(uuid[]) TO authenticated;

COMMIT;
