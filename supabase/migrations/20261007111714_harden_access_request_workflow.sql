BEGIN;

CREATE TYPE public.requestable_access_tier AS ENUM (
  'l2_admin',
  'l3_developer',
  'l4_recruiter'
);

ALTER TABLE public.platform_access_requests
  ADD COLUMN requested_tier public.requestable_access_tier;

-- The legacy form was recruiter-oriented and defaulted every requester to
-- platform_support, so preserve those pending requests as L4 requests.
UPDATE public.platform_access_requests
SET requested_tier = CASE requested_role
  WHEN 'platform_owner'::public.platform_role THEN 'l2_admin'::public.requestable_access_tier
  WHEN 'platform_admin'::public.platform_role THEN 'l2_admin'::public.requestable_access_tier
  WHEN 'platform_support'::public.platform_role THEN 'l4_recruiter'::public.requestable_access_tier
END
WHERE requested_tier IS NULL;

ALTER TABLE public.platform_access_requests
  ALTER COLUMN requested_tier SET NOT NULL,
  ALTER COLUMN requested_role DROP NOT NULL,
  ALTER COLUMN requested_role DROP DEFAULT;

-- NOT VALID preserves historical rows that predate validation while enforcing
-- the rule for every new or modified request.
ALTER TABLE public.platform_access_requests
  ADD CONSTRAINT platform_access_requests_reason_valid
  CHECK (
    reason IS NOT NULL
    AND char_length(btrim(reason)) BETWEEN 10 AND 1000
  ) NOT VALID;

CREATE INDEX platform_access_requests_requested_tier_idx
  ON public.platform_access_requests (requested_tier, status, created_at DESC);

-- Requesters can create and read only their own pending request. Review fields
-- and status changes are owned by the review RPC below.
REVOKE UPDATE ON TABLE public.platform_access_requests FROM authenticated;
DROP POLICY IF EXISTS platform_access_requests_update_platform
  ON public.platform_access_requests;

CREATE OR REPLACE FUNCTION public.review_platform_access_request(
  _request_id uuid,
  _approve boolean,
  _note text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  status public.access_request_status,
  reviewed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  request_record public.platform_access_requests%ROWTYPE;
  target_tenant_id uuid;
  assigned_role public.app_role;
  decision_time timestamptz := statement_timestamp();
BEGIN
  IF actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles AS actor_profile
    JOIN public.platform_admins AS actor_platform
      ON actor_platform.user_id = actor_profile.id
    WHERE actor_profile.id = actor_id
      AND actor_profile.is_active = true
      AND actor_platform.role IN (
        'platform_owner'::public.platform_role,
        'platform_admin'::public.platform_role
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Platform administrator privileges required';
  END IF;

  IF _note IS NOT NULL AND char_length(btrim(_note)) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Review note is too long';
  END IF;

  SELECT request_row.*
  INTO request_record
  FROM public.platform_access_requests AS request_row
  WHERE request_row.id = _request_id
  FOR UPDATE;

  IF request_record.id IS NULL OR request_record.status <> 'pending'::public.access_request_status THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Pending access request not found';
  END IF;

  IF request_record.user_id = actor_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Reviewers cannot approve their own requests';
  END IF;

  IF _approve THEN
    SELECT target_profile.tenant_id
    INTO target_tenant_id
    FROM public.profiles AS target_profile
    WHERE target_profile.id = request_record.user_id
      AND target_profile.is_active = true;

    IF target_tenant_id IS NULL
       OR request_record.tenant_id IS NULL
       OR target_tenant_id <> request_record.tenant_id THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Requester must have a verified tenant assignment';
    END IF;

    assigned_role := CASE request_record.requested_tier
      WHEN 'l2_admin'::public.requestable_access_tier THEN 'admin'::public.app_role
      WHEN 'l3_developer'::public.requestable_access_tier THEN 'developer_admin'::public.app_role
      WHEN 'l4_recruiter'::public.requestable_access_tier THEN 'recruiter'::public.app_role
    END;

    DELETE FROM public.user_roles AS existing_role
    WHERE existing_role.user_id = request_record.user_id;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (request_record.user_id, assigned_role);
  END IF;

  UPDATE public.platform_access_requests AS request_row
  SET status = CASE
        WHEN _approve THEN 'approved'::public.access_request_status
        ELSE 'denied'::public.access_request_status
      END,
      reviewed_by = actor_id,
      reviewed_at = decision_time,
      review_note = NULLIF(btrim(_note), '')
  WHERE request_row.id = request_record.id;

  id := request_record.id;
  status := CASE
    WHEN _approve THEN 'approved'::public.access_request_status
    ELSE 'denied'::public.access_request_status
  END;
  reviewed_at := decision_time;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.review_platform_access_request(uuid, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_platform_access_request(uuid, boolean, text)
  TO authenticated;

COMMENT ON FUNCTION public.review_platform_access_request(uuid, boolean, text) IS
  'Atomically reviews one pending access request and assigns its approved tenant role after verifying the reviewer, requester, and tenant.';

COMMIT;
