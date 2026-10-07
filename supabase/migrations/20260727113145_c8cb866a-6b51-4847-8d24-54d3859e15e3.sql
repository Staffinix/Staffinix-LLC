CREATE TYPE public.tenant_plan AS ENUM ('trial','starter','growth','enterprise');
CREATE TYPE public.tenant_status AS ENUM ('active','trialing','suspended','cancelled');
CREATE TYPE public.platform_role AS ENUM ('platform_owner','platform_admin','platform_support');

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan public.tenant_plan NOT NULL DEFAULT 'trial',
  status public.tenant_status NOT NULL DEFAULT 'trialing',
  seat_limit integer NOT NULL DEFAULT 10,
  industry text,
  website text,
  logo_url text,
  primary_contact_email text,
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role public.platform_role NOT NULL DEFAULT 'platform_admin',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user_id)
$$;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

ALTER TABLE public.profiles ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
INSERT INTO public.tenants (name, slug, plan, status, seat_limit, primary_contact_email)
VALUES ('Staffinix Demo Co', 'staffinix-demo', 'enterprise', 'active', 100,
        (SELECT email FROM public.profiles ORDER BY created_at LIMIT 1));
UPDATE public.profiles SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'staffinix-demo');

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, service_role;

CREATE POLICY "Members read own tenant" ON public.tenants FOR SELECT TO authenticated
  USING (id = public.current_tenant_id() OR public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform manages tenants" ON public.tenants FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "Company admins update own tenant" ON public.tenants FOR UPDATE TO authenticated
  USING (id = public.current_tenant_id() AND public.is_admin(auth.uid()))
  WITH CHECK (id = public.current_tenant_id());

CREATE POLICY "Platform admins visible" ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

INSERT INTO public.platform_admins (user_id, role)
SELECT user_id, 'platform_owner' FROM public.user_roles WHERE role = 'super_admin' ORDER BY created_at LIMIT 1
ON CONFLICT (user_id) DO NOTHING;

DO $$
DECLARE t text; d uuid;
BEGIN
  SELECT id INTO d FROM public.tenants WHERE slug = 'staffinix-demo';
  FOREACH t IN ARRAY ARRAY['clients','vendors','requirements','candidates','submissions','interviews','placements','audit_logs']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE', t);
    EXECUTE format('UPDATE public.%I SET tenant_id = %L', t, d);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id()', t);
    EXECUTE format('CREATE INDEX %I ON public.%I(tenant_id)', 'idx_' || t || '_tenant', t);
    EXECUTE format($f$CREATE POLICY "Tenant isolation" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
      USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin(auth.uid()))$f$, t);
  END LOOP;
END $$;

ALTER TABLE public.profiles ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
CREATE INDEX idx_profiles_tenant ON public.profiles(tenant_id);
CREATE POLICY "Tenant isolation" ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin(auth.uid()));

CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{read}',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins manage api keys" ON public.api_keys FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_admin(auth.uid()))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_admin(auth.uid()));

CREATE TABLE public.workflow_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  auto_parse_resumes boolean NOT NULL DEFAULT true,
  auto_match_on_requirement boolean NOT NULL DEFAULT true,
  auto_draft_submission_email boolean NOT NULL DEFAULT true,
  interview_reminders boolean NOT NULL DEFAULT true,
  match_score_threshold integer NOT NULL DEFAULT 70,
  webhook_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_settings TO authenticated;
GRANT ALL ON public.workflow_settings TO service_role;
ALTER TABLE public.workflow_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant reads workflow settings" ON public.workflow_settings FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin(auth.uid()));
CREATE POLICY "Tenant admins write workflow settings" ON public.workflow_settings FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_admin(auth.uid()))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_admin(auth.uid()));

INSERT INTO public.workflow_settings (tenant_id) SELECT id FROM public.tenants WHERE slug = 'staffinix-demo';

CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_workflow_settings_updated BEFORE UPDATE ON public.workflow_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  _is_first_user BOOLEAN;
  _initial_role public.app_role;
  _full_name TEXT;
  _tenant_id uuid;
BEGIN
  _full_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    split_part(NEW.email, '@', 1)
  );

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO _is_first_user;

  IF _is_first_user THEN
    INSERT INTO public.tenants (name, slug, plan, status, primary_contact_email)
    VALUES (split_part(NEW.email, '@', 2), 'org-' || substr(replace(NEW.id::text,'-',''), 1, 12), 'trial', 'trialing', NEW.email)
    RETURNING id INTO _tenant_id;
  ELSE
    SELECT id INTO _tenant_id FROM public.tenants ORDER BY created_at LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, avatar_url, tenant_id)
  VALUES (NEW.id, NEW.email, _full_name, NEW.raw_user_meta_data ->> 'avatar_url', _tenant_id)
  ON CONFLICT (id) DO NOTHING;

  _initial_role := CASE WHEN _is_first_user THEN 'super_admin'::public.app_role
                        ELSE 'recruiter'::public.app_role END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _initial_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF _is_first_user THEN
    INSERT INTO public.platform_admins (user_id, role) VALUES (NEW.id, 'platform_owner')
    ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO public.workflow_settings (tenant_id) VALUES (_tenant_id) ON CONFLICT (tenant_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;