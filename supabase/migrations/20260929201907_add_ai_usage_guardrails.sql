CREATE TABLE private.ai_usage_buckets (
  scope_type text NOT NULL CHECK (scope_type IN ('user', 'tenant')),
  scope_id uuid NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('minute', 'day', 'month')),
  period_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  token_units bigint NOT NULL DEFAULT 0 CHECK (token_units >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_type, scope_id, period_type, period_start)
);

ALTER TABLE private.ai_usage_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_usage_buckets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.ai_usage_buckets FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reserve_ai_usage(_operation text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_tenant_id uuid;
  tenant_scope_id uuid;
  token_charge bigint;
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now());
  month_start timestamptz := date_trunc('month', now());
  accepted integer;
  user_minute_limit constant integer := 8;
  tenant_minute_limit constant integer := 80;
  user_daily_token_limit constant bigint := 100000;
  tenant_daily_token_limit constant bigint := 1000000;
  user_monthly_token_limit constant bigint := 2000000;
  tenant_monthly_token_limit constant bigint := 20000000;
BEGIN
  token_charge := CASE _operation
    WHEN 'copilot' THEN 5000
    WHEN 'candidate_parse' THEN 7000
    WHEN 'requirement_parse' THEN 5000
    WHEN 'match_rationale' THEN 2500
    WHEN 'resume_tailor' THEN 8000
    WHEN 'semantic_search' THEN 2000
    WHEN 'requirement_embedding' THEN 3000
    ELSE NULL
  END;

  IF actor_id IS NULL OR token_charge IS NULL THEN
    RAISE EXCEPTION 'AI usage reservation is not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT p.tenant_id
  INTO actor_tenant_id
  FROM public.profiles AS p
  WHERE p.id = actor_id
    AND p.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI usage reservation is not authorized' USING ERRCODE = '42501';
  END IF;

  tenant_scope_id := COALESCE(actor_tenant_id, actor_id);

  -- Serialize reservations for the user and tenant so concurrent requests
  -- cannot overrun a bucket between the check and update.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai-user:' || actor_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai-tenant:' || tenant_scope_id::text, 0));

  INSERT INTO private.ai_usage_buckets (
    scope_type, scope_id, period_type, period_start, request_count, token_units
  ) VALUES ('user', actor_id, 'minute', minute_start, 1, 0)
  ON CONFLICT (scope_type, scope_id, period_type, period_start)
  DO UPDATE SET
    request_count = private.ai_usage_buckets.request_count + 1,
    updated_at = now()
  WHERE private.ai_usage_buckets.request_count < user_minute_limit
  RETURNING 1 INTO accepted;
  IF accepted IS NULL THEN
    RAISE EXCEPTION 'Per-user AI request limit reached' USING ERRCODE = 'P0001';
  END IF;

  accepted := NULL;
  INSERT INTO private.ai_usage_buckets (
    scope_type, scope_id, period_type, period_start, request_count, token_units
  ) VALUES ('tenant', tenant_scope_id, 'minute', minute_start, 1, 0)
  ON CONFLICT (scope_type, scope_id, period_type, period_start)
  DO UPDATE SET
    request_count = private.ai_usage_buckets.request_count + 1,
    updated_at = now()
  WHERE private.ai_usage_buckets.request_count < tenant_minute_limit
  RETURNING 1 INTO accepted;
  IF accepted IS NULL THEN
    RAISE EXCEPTION 'Per-tenant AI request limit reached' USING ERRCODE = 'P0001';
  END IF;

  accepted := NULL;
  INSERT INTO private.ai_usage_buckets (
    scope_type, scope_id, period_type, period_start, request_count, token_units
  ) VALUES ('user', actor_id, 'day', day_start, 0, token_charge)
  ON CONFLICT (scope_type, scope_id, period_type, period_start)
  DO UPDATE SET
    token_units = private.ai_usage_buckets.token_units + token_charge,
    updated_at = now()
  WHERE private.ai_usage_buckets.token_units + token_charge <= user_daily_token_limit
  RETURNING 1 INTO accepted;
  IF accepted IS NULL THEN
    RAISE EXCEPTION 'Per-user daily AI budget reached' USING ERRCODE = 'P0001';
  END IF;

  accepted := NULL;
  INSERT INTO private.ai_usage_buckets (
    scope_type, scope_id, period_type, period_start, request_count, token_units
  ) VALUES ('tenant', tenant_scope_id, 'day', day_start, 0, token_charge)
  ON CONFLICT (scope_type, scope_id, period_type, period_start)
  DO UPDATE SET
    token_units = private.ai_usage_buckets.token_units + token_charge,
    updated_at = now()
  WHERE private.ai_usage_buckets.token_units + token_charge <= tenant_daily_token_limit
  RETURNING 1 INTO accepted;
  IF accepted IS NULL THEN
    RAISE EXCEPTION 'Per-tenant daily AI budget reached' USING ERRCODE = 'P0001';
  END IF;

  accepted := NULL;
  INSERT INTO private.ai_usage_buckets (
    scope_type, scope_id, period_type, period_start, request_count, token_units
  ) VALUES ('user', actor_id, 'month', month_start, 0, token_charge)
  ON CONFLICT (scope_type, scope_id, period_type, period_start)
  DO UPDATE SET
    token_units = private.ai_usage_buckets.token_units + token_charge,
    updated_at = now()
  WHERE private.ai_usage_buckets.token_units + token_charge <= user_monthly_token_limit
  RETURNING 1 INTO accepted;
  IF accepted IS NULL THEN
    RAISE EXCEPTION 'Per-user monthly AI budget reached' USING ERRCODE = 'P0001';
  END IF;

  accepted := NULL;
  INSERT INTO private.ai_usage_buckets (
    scope_type, scope_id, period_type, period_start, request_count, token_units
  ) VALUES ('tenant', tenant_scope_id, 'month', month_start, 0, token_charge)
  ON CONFLICT (scope_type, scope_id, period_type, period_start)
  DO UPDATE SET
    token_units = private.ai_usage_buckets.token_units + token_charge,
    updated_at = now()
  WHERE private.ai_usage_buckets.token_units + token_charge <= tenant_monthly_token_limit
  RETURNING 1 INTO accepted;
  IF accepted IS NULL THEN
    RAISE EXCEPTION 'Per-tenant monthly AI budget reached' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM private.ai_usage_buckets
  WHERE period_start < month_start - interval '2 months';

  RETURN jsonb_build_object(
    'operation', _operation,
    'reserved_token_units', token_charge
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_usage(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(text) TO authenticated;
