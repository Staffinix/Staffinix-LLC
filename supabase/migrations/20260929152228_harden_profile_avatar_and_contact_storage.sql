-- Contact submissions are intentionally insert-only for public callers. Force
-- RLS so table owners cannot accidentally bypass that boundary in application
-- code while service_role retains its explicit BYPASSRLS behavior.
ALTER TABLE public.contact_us FORCE ROW LEVEL SECURITY;

-- Uploaded profile photos previously used predictable public object URLs even
-- though the object policy was written as owner-only. Make the bucket private
-- and allow active members to read avatars only within their current tenant.
UPDATE storage.buckets
SET public = false
WHERE id = 'profile-avatars';

DROP POLICY IF EXISTS profile_avatars_select_own ON storage.objects;
DROP POLICY IF EXISTS profile_avatars_select_tenant ON storage.objects;

CREATE OR REPLACE FUNCTION private.can_read_profile_avatar(_owner_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS actor
    JOIN public.profiles AS avatar_owner
      ON avatar_owner.tenant_id = actor.tenant_id
    WHERE actor.id = (SELECT auth.uid())
      AND actor.is_active
      AND avatar_owner.is_active
      AND avatar_owner.id::text = _owner_id
  );
$$;

REVOKE ALL ON FUNCTION private.can_read_profile_avatar(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_profile_avatar(text) TO authenticated;

CREATE POLICY profile_avatars_select_tenant
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND name = split_part(name, '/', 1) || '/avatar'
  AND (SELECT private.can_read_profile_avatar(split_part(name, '/', 1)))
);

DROP POLICY IF EXISTS profile_avatars_insert_own ON storage.objects;
CREATE POLICY profile_avatars_insert_own
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-avatars'
  AND name = (SELECT auth.uid())::text || '/avatar'
  AND owner_id = (SELECT auth.uid())::text
  AND (SELECT private.is_active_user())
);

DROP POLICY IF EXISTS profile_avatars_update_own ON storage.objects;
CREATE POLICY profile_avatars_update_own
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND name = (SELECT auth.uid())::text || '/avatar'
  AND owner_id = (SELECT auth.uid())::text
  AND (SELECT private.is_active_user())
)
WITH CHECK (
  bucket_id = 'profile-avatars'
  AND name = (SELECT auth.uid())::text || '/avatar'
  AND owner_id = (SELECT auth.uid())::text
  AND (SELECT private.is_active_user())
);

DROP POLICY IF EXISTS profile_avatars_delete_own ON storage.objects;
CREATE POLICY profile_avatars_delete_own
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND name = (SELECT auth.uid())::text || '/avatar'
  AND owner_id = (SELECT auth.uid())::text
  AND (SELECT private.is_active_user())
);
