BEGIN;

-- The signup trigger now creates identity-only profiles, but users created
-- before that trigger was repaired may still exist only in auth.users. Those
-- users have a valid Supabase session yet cannot pass the application's active
-- profile check. Repair only the missing identity record here. Tenant and role
-- assignments remain separate, administrator-controlled operations.
INSERT INTO public.profiles (
  id,
  email,
  full_name,
  avatar_url,
  tenant_id,
  is_active
)
SELECT
  users.id,
  users.email,
  COALESCE(
    NULLIF(BTRIM(users.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(BTRIM(users.raw_user_meta_data ->> 'name'), ''),
    split_part(users.email, '@', 1)
  ),
  COALESCE(
    NULLIF(BTRIM(users.raw_user_meta_data ->> 'avatar_url'), ''),
    NULLIF(BTRIM(users.raw_user_meta_data ->> 'picture'), '')
  ),
  NULL,
  true
FROM auth.users AS users
WHERE users.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profiles
    WHERE profiles.id = users.id
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;
