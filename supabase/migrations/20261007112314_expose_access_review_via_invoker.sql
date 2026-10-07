BEGIN;

ALTER FUNCTION public.review_platform_access_request(uuid, boolean, text)
  SET SCHEMA private;

REVOKE ALL ON FUNCTION private.review_platform_access_request(uuid, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.review_platform_access_request(uuid, boolean, text)
  TO authenticated;

-- Keep the privileged implementation outside the exposed API schema. The
-- public endpoint is an invoker-rights wrapper; the private implementation
-- still verifies auth.uid(), active status, reviewer role, tenant, and self-
-- approval before changing authorization state.
CREATE FUNCTION public.review_platform_access_request(
  _request_id uuid,
  _approve boolean,
  _note text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  status public.access_request_status,
  reviewed_at timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT review_result.id, review_result.status, review_result.reviewed_at
  FROM private.review_platform_access_request(_request_id, _approve, _note) AS review_result;
$$;

REVOKE ALL ON FUNCTION public.review_platform_access_request(uuid, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_platform_access_request(uuid, boolean, text)
  TO authenticated;

COMMENT ON FUNCTION public.review_platform_access_request(uuid, boolean, text) IS
  'Invoker-rights API wrapper for the identity-checked private access review operation.';

COMMIT;
