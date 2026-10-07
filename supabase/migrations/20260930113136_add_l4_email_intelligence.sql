BEGIN;

CREATE OR REPLACE FUNCTION private.is_l4_recruiter()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    JOIN public.user_roles AS ur ON ur.user_id = p.id
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active = true
      AND p.tenant_id IS NOT NULL
      AND ur.role = 'recruiter'::public.app_role
  );
$$;

REVOKE ALL ON FUNCTION private.is_l4_recruiter() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_l4_recruiter() TO authenticated;

CREATE TABLE public.email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('gmail', 'microsoft')),
  provider_account_id text NOT NULL CHECK (length(provider_account_id) BETWEEN 1 AND 320),
  email_address text NOT NULL CHECK (length(email_address) BETWEEN 3 AND 320),
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text,
  token_expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'reauthorization_required', 'disconnected', 'error')),
  sync_cursor text,
  last_sync_at timestamptz,
  last_sync_error_code text CHECK (last_sync_error_code IS NULL OR length(last_sync_error_code) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, provider_account_id),
  UNIQUE (id, user_id)
);

CREATE TABLE public.email_filter_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email_account_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  enabled boolean NOT NULL DEFAULT true,
  match_mode text NOT NULL DEFAULT 'and' CHECK (match_mode IN ('and', 'or')),
  sender_emails text[] NOT NULL DEFAULT '{}',
  sender_domains text[] NOT NULL DEFAULT '{}',
  subject_keywords text[] NOT NULL DEFAULT '{}',
  subject_exact text,
  body_keywords text[] NOT NULL DEFAULT '{}',
  required_keywords text[] NOT NULL DEFAULT '{}',
  excluded_keywords text[] NOT NULL DEFAULT '{}',
  require_attachment boolean NOT NULL DEFAULT false,
  allowed_attachment_types text[] NOT NULL DEFAULT '{}',
  ai_enabled boolean NOT NULL DEFAULT false,
  ai_category text CHECK (ai_category IS NULL OR length(ai_category) <= 120),
  ai_prompt text CHECK (ai_prompt IS NULL OR length(ai_prompt) <= 1000),
  minimum_relevance_score numeric(4,3) NOT NULL DEFAULT 0.700
    CHECK (minimum_relevance_score BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (email_account_id, user_id)
    REFERENCES public.email_accounts(id, user_id) ON DELETE CASCADE,
  UNIQUE (id, user_id)
);

CREATE TABLE public.selected_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email_account_id uuid NOT NULL,
  provider_message_id text NOT NULL CHECK (length(provider_message_id) BETWEEN 1 AND 1000),
  provider_thread_id text,
  sender_name text,
  sender_email text NOT NULL CHECK (length(sender_email) BETWEEN 3 AND 320),
  recipient_emails text[] NOT NULL DEFAULT '{}',
  subject text NOT NULL DEFAULT '',
  preview text NOT NULL DEFAULT '' CHECK (length(preview) <= 1000),
  received_at timestamptz NOT NULL,
  has_attachments boolean NOT NULL DEFAULT false,
  matched_rule_id uuid,
  relevance_score numeric(4,3) NOT NULL CHECK (relevance_score BETWEEN 0 AND 1),
  match_reasons text[] NOT NULL DEFAULT '{}',
  match_checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_category text,
  ai_confidence numeric(4,3) CHECK (ai_confidence IS NULL OR ai_confidence BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (email_account_id, user_id)
    REFERENCES public.email_accounts(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (matched_rule_id, user_id)
    REFERENCES public.email_filter_rules(id, user_id) ON DELETE SET NULL,
  UNIQUE (email_account_id, provider_message_id),
  UNIQUE (id, user_id)
);

CREATE TABLE public.email_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  selected_email_id uuid NOT NULL,
  provider_attachment_id text NOT NULL,
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 500),
  mime_type text NOT NULL CHECK (length(mime_type) BETWEEN 1 AND 255),
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes BETWEEN 0 AND 1073741824),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (selected_email_id, user_id)
    REFERENCES public.selected_emails(id, user_id) ON DELETE CASCADE,
  UNIQUE (selected_email_id, provider_attachment_id)
);

CREATE TABLE public.email_processing_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email_account_id uuid,
  provider text NOT NULL CHECK (provider IN ('gmail', 'microsoft')),
  provider_message_fingerprint text,
  status text NOT NULL CHECK (status IN ('selected', 'ignored', 'failed', 'duplicate')),
  matched_rule_id uuid,
  processing_duration_ms integer NOT NULL DEFAULT 0 CHECK (processing_duration_ms BETWEEN 0 AND 600000),
  error_code text CHECK (error_code IS NULL OR length(error_code) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (email_account_id, user_id)
    REFERENCES public.email_accounts(id, user_id) ON DELETE SET NULL (email_account_id),
  FOREIGN KEY (matched_rule_id, user_id)
    REFERENCES public.email_filter_rules(id, user_id) ON DELETE SET NULL (matched_rule_id)
);

CREATE TABLE public.email_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('gmail', 'microsoft')),
  state_hash text NOT NULL UNIQUE,
  encrypted_pkce_verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.email_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email_account_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_code text CHECK (error_code IS NULL OR length(error_code) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (email_account_id, user_id)
    REFERENCES public.email_accounts(id, user_id) ON DELETE CASCADE
);

CREATE TRIGGER trg_email_accounts_updated_at
BEFORE UPDATE ON public.email_accounts FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_email_filter_rules_updated_at
BEFORE UPDATE ON public.email_filter_rules FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE INDEX email_accounts_user_status_idx
  ON public.email_accounts (user_id, status, updated_at DESC);
CREATE INDEX email_filter_rules_user_enabled_idx
  ON public.email_filter_rules (user_id, enabled, updated_at DESC);
CREATE INDEX selected_emails_user_received_idx
  ON public.selected_emails (user_id, received_at DESC);
CREATE INDEX selected_emails_user_provider_score_idx
  ON public.selected_emails (user_id, email_account_id, relevance_score DESC, received_at DESC);
CREATE INDEX email_attachments_selected_idx
  ON public.email_attachments (selected_email_id);
CREATE INDEX email_processing_logs_user_created_idx
  ON public.email_processing_logs (user_id, created_at DESC);
CREATE INDEX email_processing_logs_user_status_created_idx
  ON public.email_processing_logs (user_id, status, created_at DESC);
CREATE INDEX email_oauth_states_user_expiry_idx
  ON public.email_oauth_states (user_id, expires_at);
CREATE UNIQUE INDEX email_sync_jobs_one_active_per_account_idx
  ON public.email_sync_jobs (email_account_id)
  WHERE status IN ('queued', 'running');
CREATE INDEX email_sync_jobs_queue_idx
  ON public.email_sync_jobs (status, scheduled_at)
  WHERE status = 'queued';

ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.email_filter_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_filter_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.selected_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selected_emails FORCE ROW LEVEL SECURITY;
ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.email_processing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_processing_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.email_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_oauth_states FORCE ROW LEVEL SECURITY;
ALTER TABLE public.email_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sync_jobs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_accounts, public.email_filter_rules, public.selected_emails,
  public.email_attachments, public.email_processing_logs, public.email_oauth_states,
  public.email_sync_jobs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_accounts, public.email_filter_rules,
  public.selected_emails, public.email_attachments, public.email_oauth_states,
  public.email_sync_jobs TO authenticated;
GRANT SELECT, INSERT ON public.email_processing_logs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.email_processing_logs_id_seq TO authenticated;

CREATE POLICY email_accounts_select_l4_self ON public.email_accounts FOR SELECT TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY email_accounts_insert_l4_self ON public.email_accounts FOR INSERT TO authenticated
WITH CHECK ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY email_accounts_update_l4_self ON public.email_accounts FOR UPDATE TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()))
WITH CHECK ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY email_accounts_delete_l4_self ON public.email_accounts FOR DELETE TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));

CREATE POLICY email_filter_rules_select_l4_self ON public.email_filter_rules FOR SELECT TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY email_filter_rules_insert_l4_self ON public.email_filter_rules FOR INSERT TO authenticated
WITH CHECK ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY email_filter_rules_update_l4_self ON public.email_filter_rules FOR UPDATE TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()))
WITH CHECK ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY email_filter_rules_delete_l4_self ON public.email_filter_rules FOR DELETE TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));

CREATE POLICY selected_emails_select_l4_self ON public.selected_emails FOR SELECT TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY selected_emails_insert_l4_self ON public.selected_emails FOR INSERT TO authenticated
WITH CHECK ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY selected_emails_update_l4_self ON public.selected_emails FOR UPDATE TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()))
WITH CHECK ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY selected_emails_delete_l4_self ON public.selected_emails FOR DELETE TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));

CREATE POLICY email_attachments_select_l4_self ON public.email_attachments FOR SELECT TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY email_attachments_insert_l4_self ON public.email_attachments FOR INSERT TO authenticated
WITH CHECK ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY email_attachments_update_l4_self ON public.email_attachments FOR UPDATE TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()))
WITH CHECK ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY email_attachments_delete_l4_self ON public.email_attachments FOR DELETE TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));

CREATE POLICY email_processing_logs_select_l4_self ON public.email_processing_logs FOR SELECT TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY email_processing_logs_insert_l4_self ON public.email_processing_logs FOR INSERT TO authenticated
WITH CHECK ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));

CREATE POLICY email_oauth_states_select_l4_self ON public.email_oauth_states FOR SELECT TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY email_oauth_states_insert_l4_self ON public.email_oauth_states FOR INSERT TO authenticated
WITH CHECK ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY email_oauth_states_delete_l4_self ON public.email_oauth_states FOR DELETE TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));

CREATE POLICY email_sync_jobs_select_l4_self ON public.email_sync_jobs FOR SELECT TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY email_sync_jobs_insert_l4_self ON public.email_sync_jobs FOR INSERT TO authenticated
WITH CHECK ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY email_sync_jobs_update_l4_self ON public.email_sync_jobs FOR UPDATE TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()))
WITH CHECK ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));
CREATE POLICY email_sync_jobs_delete_l4_self ON public.email_sync_jobs FOR DELETE TO authenticated
USING ((SELECT private.is_l4_recruiter()) AND user_id = (SELECT auth.uid()) AND tenant_id = (SELECT private.current_tenant_id()));

COMMIT;
