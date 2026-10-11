BEGIN;
-- Do not inherit broad Supabase default grants on freshly created tables.
REVOKE ALL ON TABLE public.contact_us FROM PUBLIC, anon, authenticated;
GRANT INSERT ON TABLE public.contact_us TO anon, authenticated;
REVOKE ALL ON TABLE public.copilot_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.copilot_messages TO authenticated;
-- Embedding writes use the server-side privileged worker, never API roles.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.candidate_embeddings, public.requirement_embeddings
  FROM PUBLIC, anon, authenticated;
COMMIT;
