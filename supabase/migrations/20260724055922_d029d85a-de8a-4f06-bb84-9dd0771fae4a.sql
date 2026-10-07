
-- Enums
DO $$ BEGIN CREATE TYPE public.candidate_status AS ENUM ('active','submitted','placed','on_hold','inactive'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.availability_status AS ENUM ('immediate','two_weeks','one_month','negotiable','unavailable'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE EXTENSION IF NOT EXISTS vector;

-- Candidates
CREATE TABLE IF NOT EXISTS public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  location text,
  current_employer text,
  current_title text,
  primary_technology text,
  visa_status text,
  availability public.availability_status,
  min_rate numeric(10,2),
  max_rate numeric(10,2),
  rate_type public.requirement_rate_type,
  currency text NOT NULL DEFAULT 'USD',
  experience_years numeric(4,1),
  linkedin_url text,
  github_url text,
  portfolio_url text,
  summary text,
  ai_notes text,
  ats_score integer CHECK (ats_score IS NULL OR (ats_score BETWEEN 0 AND 100)),
  status public.candidate_status NOT NULL DEFAULT 'active',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source public.requirement_source NOT NULL DEFAULT 'manual',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO authenticated;
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "candidates_read_all_auth" ON public.candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY "candidates_insert_auth" ON public.candidates FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "candidates_update_own_or_admin" ON public.candidates FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR auth.uid() = assigned_to OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = created_by OR auth.uid() = assigned_to OR public.is_admin(auth.uid()));
CREATE POLICY "candidates_delete_admin" ON public.candidates FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS candidates_status_idx ON public.candidates(status);
CREATE INDEX IF NOT EXISTS candidates_visa_idx ON public.candidates(visa_status);
CREATE INDEX IF NOT EXISTS candidates_availability_idx ON public.candidates(availability);
CREATE INDEX IF NOT EXISTS candidates_location_trgm_idx ON public.candidates USING gin (location gin_trgm_ops);
CREATE INDEX IF NOT EXISTS candidates_name_trgm_idx ON public.candidates USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS candidates_employer_trgm_idx ON public.candidates USING gin (current_employer gin_trgm_ops);
CREATE TRIGGER candidates_touch BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Skills
CREATE TABLE IF NOT EXISTS public.candidate_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  skill text NOT NULL,
  years numeric(4,1),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS candidate_skills_unique ON public.candidate_skills(candidate_id, lower(skill));
CREATE INDEX IF NOT EXISTS candidate_skills_skill_trgm_idx ON public.candidate_skills USING gin (skill gin_trgm_ops);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_skills TO authenticated;
GRANT ALL ON public.candidate_skills TO service_role;
ALTER TABLE public.candidate_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cskills_read" ON public.candidate_skills FOR SELECT TO authenticated USING (true);
CREATE POLICY "cskills_write" ON public.candidate_skills FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND (c.created_by = auth.uid() OR c.assigned_to = auth.uid() OR public.is_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND (c.created_by = auth.uid() OR c.assigned_to = auth.uid() OR public.is_admin(auth.uid()))));

-- Employment
CREATE TABLE IF NOT EXISTS public.candidate_employment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  company text NOT NULL,
  title text,
  location text,
  start_date date,
  end_date date,
  is_current boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_employment_candidate_idx ON public.candidate_employment(candidate_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_employment TO authenticated;
GRANT ALL ON public.candidate_employment TO service_role;
ALTER TABLE public.candidate_employment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cemp_read" ON public.candidate_employment FOR SELECT TO authenticated USING (true);
CREATE POLICY "cemp_write" ON public.candidate_employment FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND (c.created_by = auth.uid() OR c.assigned_to = auth.uid() OR public.is_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND (c.created_by = auth.uid() OR c.assigned_to = auth.uid() OR public.is_admin(auth.uid()))));

-- Education
CREATE TABLE IF NOT EXISTS public.candidate_education (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  institution text NOT NULL,
  degree text,
  field text,
  start_year integer,
  end_year integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_education_candidate_idx ON public.candidate_education(candidate_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_education TO authenticated;
GRANT ALL ON public.candidate_education TO service_role;
ALTER TABLE public.candidate_education ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cedu_read" ON public.candidate_education FOR SELECT TO authenticated USING (true);
CREATE POLICY "cedu_write" ON public.candidate_education FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND (c.created_by = auth.uid() OR c.assigned_to = auth.uid() OR public.is_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND (c.created_by = auth.uid() OR c.assigned_to = auth.uid() OR public.is_admin(auth.uid()))));

-- Projects
CREATE TABLE IF NOT EXISTS public.candidate_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  technologies text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_projects_candidate_idx ON public.candidate_projects(candidate_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_projects TO authenticated;
GRANT ALL ON public.candidate_projects TO service_role;
ALTER TABLE public.candidate_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cproj_read" ON public.candidate_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "cproj_write" ON public.candidate_projects FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND (c.created_by = auth.uid() OR c.assigned_to = auth.uid() OR public.is_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND (c.created_by = auth.uid() OR c.assigned_to = auth.uid() OR public.is_admin(auth.uid()))));

-- Certifications
CREATE TABLE IF NOT EXISTS public.candidate_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  name text NOT NULL,
  issuer text,
  issued_date date,
  expires_date date,
  credential_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_cert_candidate_idx ON public.candidate_certifications(candidate_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_certifications TO authenticated;
GRANT ALL ON public.candidate_certifications TO service_role;
ALTER TABLE public.candidate_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ccert_read" ON public.candidate_certifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "ccert_write" ON public.candidate_certifications FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND (c.created_by = auth.uid() OR c.assigned_to = auth.uid() OR public.is_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND (c.created_by = auth.uid() OR c.assigned_to = auth.uid() OR public.is_admin(auth.uid()))));

-- Resumes
CREATE TABLE IF NOT EXISTS public.resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  is_primary boolean NOT NULL DEFAULT false,
  extracted_text text,
  source public.requirement_source NOT NULL DEFAULT 'manual',
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resumes_candidate_idx ON public.resumes(candidate_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumes TO authenticated;
GRANT ALL ON public.resumes TO service_role;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resumes_read" ON public.resumes FOR SELECT TO authenticated USING (true);
CREATE POLICY "resumes_write" ON public.resumes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND (c.created_by = auth.uid() OR c.assigned_to = auth.uid() OR public.is_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND (c.created_by = auth.uid() OR c.assigned_to = auth.uid() OR public.is_admin(auth.uid()))));

-- Resume versions
CREATE TABLE IF NOT EXISTS public.resume_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  requirement_id uuid REFERENCES public.requirements(id) ON DELETE SET NULL,
  version_no integer NOT NULL DEFAULT 1,
  file_path text,
  tailored_summary text,
  tailored_content text,
  ats_score integer CHECK (ats_score IS NULL OR (ats_score BETWEEN 0 AND 100)),
  match_score integer CHECK (match_score IS NULL OR (match_score BETWEEN 0 AND 100)),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resume_versions_candidate_idx ON public.resume_versions(candidate_id);
CREATE INDEX IF NOT EXISTS resume_versions_req_idx ON public.resume_versions(requirement_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_versions TO authenticated;
GRANT ALL ON public.resume_versions TO service_role;
ALTER TABLE public.resume_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rv_read" ON public.resume_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "rv_write" ON public.resume_versions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND (c.created_by = auth.uid() OR c.assigned_to = auth.uid() OR public.is_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND (c.created_by = auth.uid() OR c.assigned_to = auth.uid() OR public.is_admin(auth.uid()))));

-- Embeddings
CREATE TABLE IF NOT EXISTS public.candidate_embeddings (
  candidate_id uuid PRIMARY KEY REFERENCES public.candidates(id) ON DELETE CASCADE,
  embedding vector(3072) NOT NULL,
  model text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.candidate_embeddings TO authenticated;
GRANT ALL ON public.candidate_embeddings TO service_role;
ALTER TABLE public.candidate_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cemb_read" ON public.candidate_embeddings FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS candidate_embeddings_hnsw
  ON public.candidate_embeddings USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

CREATE TABLE IF NOT EXISTS public.requirement_embeddings (
  requirement_id uuid PRIMARY KEY REFERENCES public.requirements(id) ON DELETE CASCADE,
  embedding vector(3072) NOT NULL,
  model text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.requirement_embeddings TO authenticated;
GRANT ALL ON public.requirement_embeddings TO service_role;
ALTER TABLE public.requirement_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "remb_read" ON public.requirement_embeddings FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS requirement_embeddings_hnsw
  ON public.requirement_embeddings USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

-- Match RPC functions
CREATE OR REPLACE FUNCTION public.match_candidates_for_requirement(_requirement_id uuid, _limit integer DEFAULT 25)
RETURNS TABLE (candidate_id uuid, similarity real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH q AS (SELECT embedding FROM public.requirement_embeddings WHERE requirement_id = _requirement_id)
  SELECT ce.candidate_id,
         (1 - (ce.embedding::halfvec(3072) <=> (SELECT embedding FROM q)::halfvec(3072)))::real
  FROM public.candidate_embeddings ce, q
  ORDER BY ce.embedding::halfvec(3072) <=> (SELECT embedding FROM q)::halfvec(3072)
  LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.match_requirements_for_candidate(_candidate_id uuid, _limit integer DEFAULT 25)
RETURNS TABLE (requirement_id uuid, similarity real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH q AS (SELECT embedding FROM public.candidate_embeddings WHERE candidate_id = _candidate_id)
  SELECT re.requirement_id,
         (1 - (re.embedding::halfvec(3072) <=> (SELECT embedding FROM q)::halfvec(3072)))::real
  FROM public.requirement_embeddings re, q
  ORDER BY re.embedding::halfvec(3072) <=> (SELECT embedding FROM q)::halfvec(3072)
  LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.search_candidates_semantic(_query_embedding vector(3072), _limit integer DEFAULT 25)
RETURNS TABLE (candidate_id uuid, similarity real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ce.candidate_id,
         (1 - (ce.embedding::halfvec(3072) <=> _query_embedding::halfvec(3072)))::real
  FROM public.candidate_embeddings ce
  ORDER BY ce.embedding::halfvec(3072) <=> _query_embedding::halfvec(3072)
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.match_candidates_for_requirement(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_requirements_for_candidate(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_candidates_semantic(vector, integer) TO authenticated;
