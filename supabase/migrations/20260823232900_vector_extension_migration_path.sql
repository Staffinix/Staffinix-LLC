-- Supabase installs extensions outside public in clean local projects. The next
-- migration creates SQL SECURITY DEFINER functions that reference halfvec in
-- their parsed bodies while correctly setting an empty runtime search_path.
-- Include the extension schema for migration-time type resolution only.
SET search_path = public, extensions;
