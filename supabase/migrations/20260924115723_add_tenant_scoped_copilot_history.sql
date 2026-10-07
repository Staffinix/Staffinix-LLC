CREATE TABLE public.copilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT private.current_tenant_id()
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (
    char_length(btrim(content)) BETWEEN 1 AND 6000
  ),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(sources) = 'array'
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX copilot_messages_user_created_idx
  ON public.copilot_messages (user_id, created_at DESC, id DESC);
CREATE INDEX copilot_messages_tenant_idx
  ON public.copilot_messages (tenant_id);

ALTER TABLE public.copilot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_messages FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.copilot_messages FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.copilot_messages TO authenticated;

CREATE POLICY copilot_messages_select_own
ON public.copilot_messages
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND tenant_id = (SELECT private.current_tenant_id())
  AND (SELECT private.is_active_user())
);

CREATE POLICY copilot_messages_insert_own
ON public.copilot_messages
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND tenant_id = (SELECT private.current_tenant_id())
  AND (SELECT private.is_active_user())
);

CREATE POLICY copilot_messages_delete_own
ON public.copilot_messages
FOR DELETE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND tenant_id = (SELECT private.current_tenant_id())
  AND (SELECT private.is_active_user())
);
