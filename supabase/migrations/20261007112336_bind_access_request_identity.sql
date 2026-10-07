BEGIN;

CREATE OR REPLACE FUNCTION private.bind_platform_access_request_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  -- Preserve trusted migration/service writes that do not carry an end-user
  -- JWT. Authenticated API writes are always rebound to the verified identity.
  IF actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.user_id := actor_id;
  SELECT auth_user.email, profile.tenant_id
  INTO NEW.user_email, NEW.tenant_id
  FROM auth.users AS auth_user
  JOIN public.profiles AS profile ON profile.id = auth_user.id
  WHERE auth_user.id = actor_id
    AND profile.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active authentication is required';
  END IF;

  NEW.requested_role := NULL;
  NEW.status := 'pending'::public.access_request_status;
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.review_note := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.bind_platform_access_request_identity()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_platform_access_requests_bind_identity
  ON public.platform_access_requests;
CREATE TRIGGER trg_platform_access_requests_bind_identity
BEFORE INSERT ON public.platform_access_requests
FOR EACH ROW EXECUTE FUNCTION private.bind_platform_access_request_identity();

COMMIT;
