
CREATE TYPE public.requirement_status AS ENUM ('open','assigned','closed','expired');
CREATE TYPE public.requirement_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.requirement_work_mode AS ENUM ('onsite','remote','hybrid');
CREATE TYPE public.requirement_rate_type AS ENUM ('hourly','annual','monthly');
CREATE TYPE public.requirement_source AS ENUM ('manual','paste','pdf','docx','email');

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  website text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read clients" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins update clients" ON public.clients FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins delete clients" ON public.clients FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE INDEX idx_clients_name ON public.clients (lower(name));

CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  website text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read vendors" ON public.vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create vendors" ON public.vendors FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins update vendors" ON public.vendors FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins delete vendors" ON public.vendors FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE INDEX idx_vendors_name ON public.vendors (lower(name));

CREATE TABLE public.requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  location text,
  work_mode public.requirement_work_mode,
  visa_types text[] NOT NULL DEFAULT '{}',
  rate_min numeric(12,2),
  rate_max numeric(12,2),
  rate_type public.requirement_rate_type,
  currency text NOT NULL DEFAULT 'USD',
  min_experience_years int,
  max_experience_years int,
  primary_technology text,
  description text,
  recruiter_notes text,
  status public.requirement_status NOT NULL DEFAULT 'open',
  priority public.requirement_priority NOT NULL DEFAULT 'medium',
  source public.requirement_source NOT NULL DEFAULT 'manual',
  jd_file_url text,
  duration text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requirements TO authenticated;
GRANT ALL ON public.requirements TO service_role;
ALTER TABLE public.requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read requirements" ON public.requirements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create requirements" ON public.requirements FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owner/assignee/admin update requirements" ON public.requirements
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR auth.uid() = assigned_to OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = created_by OR auth.uid() = assigned_to OR public.is_admin(auth.uid()));
CREATE POLICY "Owner/admin delete requirements" ON public.requirements
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.is_admin(auth.uid()));
CREATE TRIGGER trg_requirements_updated_at BEFORE UPDATE ON public.requirements FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE INDEX idx_req_status ON public.requirements (status);
CREATE INDEX idx_req_priority ON public.requirements (priority);
CREATE INDEX idx_req_client ON public.requirements (client_id);
CREATE INDEX idx_req_assigned ON public.requirements (assigned_to);
CREATE INDEX idx_req_created_at ON public.requirements (created_at DESC);
CREATE INDEX idx_req_title_trgm ON public.requirements USING gin (lower(title) gin_trgm_ops);

CREATE TABLE public.requirement_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id uuid NOT NULL REFERENCES public.requirements(id) ON DELETE CASCADE,
  skill text NOT NULL,
  is_mandatory boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_req_skill ON public.requirement_skills (requirement_id, lower(skill));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requirement_skills TO authenticated;
GRANT ALL ON public.requirement_skills TO service_role;
ALTER TABLE public.requirement_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read skills" ON public.requirement_skills FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modify skills for editable reqs" ON public.requirement_skills
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.requirements r WHERE r.id = requirement_id
      AND (auth.uid() = r.created_by OR auth.uid() = r.assigned_to OR public.is_admin(auth.uid())))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.requirements r WHERE r.id = requirement_id
      AND (auth.uid() = r.created_by OR auth.uid() = r.assigned_to OR public.is_admin(auth.uid())))
  );
CREATE INDEX idx_req_skills_req ON public.requirement_skills (requirement_id);
