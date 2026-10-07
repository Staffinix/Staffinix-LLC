CREATE TYPE public.access_request_status AS ENUM ('pending','approved','denied');

CREATE TABLE public.platform_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  requested_role public.platform_role NOT NULL DEFAULT 'platform_owner',
  reason text,
  status public.access_request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX platform_access_requests_one_pending
  ON public.platform_access_requests (user_id)
  WHERE status = 'pending';

CREATE INDEX platform_access_requests_status_idx ON public.platform_access_requests (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.platform_access_requests TO authenticated;
GRANT ALL ON public.platform_access_requests TO service_role;

ALTER TABLE public.platform_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create their own access request"
  ON public.platform_access_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own access requests"
  ON public.platform_access_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform staff can review access requests"
  ON public.platform_access_requests FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER platform_access_requests_touch
  BEFORE UPDATE ON public.platform_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();