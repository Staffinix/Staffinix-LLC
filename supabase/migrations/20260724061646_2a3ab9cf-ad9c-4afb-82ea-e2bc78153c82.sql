
-- Enums
CREATE TYPE public.submission_stage AS ENUM (
  'draft','submitted','vendor_review','client_review','interview','offer','hired','rejected','withdrawn'
);
CREATE TYPE public.interview_round AS ENUM (
  'screen','l1','l2','manager','client','technical','final','other'
);
CREATE TYPE public.interview_outcome AS ENUM (
  'scheduled','completed','passed','failed','no_show','rescheduled','cancelled'
);
CREATE TYPE public.placement_status AS ENUM ('active','ended','terminated','extended');
CREATE TYPE public.submission_event_type AS ENUM (
  'created','stage_changed','email_drafted','email_sent','note_added','interview_scheduled','interview_updated','offer_extended','placed','rejected','withdrawn'
);

-- SUBMISSIONS
CREATE TABLE public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id uuid NOT NULL REFERENCES public.requirements(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  resume_version_id uuid REFERENCES public.resume_versions(id) ON DELETE SET NULL,
  stage public.submission_stage NOT NULL DEFAULT 'draft',
  submitted_rate numeric(10,2),
  rate_type public.requirement_rate_type,
  currency text DEFAULT 'USD',
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  email_subject text,
  email_body text,
  email_to text,
  email_cc text,
  email_sent_at timestamptz,
  match_score real,
  match_strengths text[],
  match_gaps text[],
  notes text,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  rejected_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requirement_id, candidate_id)
);
CREATE INDEX submissions_requirement_idx ON public.submissions(requirement_id);
CREATE INDEX submissions_candidate_idx ON public.submissions(candidate_id);
CREATE INDEX submissions_stage_idx ON public.submissions(stage);
CREATE INDEX submissions_created_at_idx ON public.submissions(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO authenticated;
GRANT ALL ON public.submissions TO service_role;

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "submissions_read_auth" ON public.submissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "submissions_insert_auth" ON public.submissions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "submissions_update_auth" ON public.submissions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "submissions_delete_admin" ON public.submissions FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TRIGGER submissions_touch BEFORE UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- SUBMISSION EVENTS (timeline)
CREATE TABLE public.submission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  event_type public.submission_event_type NOT NULL,
  from_stage public.submission_stage,
  to_stage public.submission_stage,
  message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX submission_events_submission_idx ON public.submission_events(submission_id, created_at DESC);

GRANT SELECT, INSERT ON public.submission_events TO authenticated;
GRANT ALL ON public.submission_events TO service_role;

ALTER TABLE public.submission_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub_events_read_auth" ON public.submission_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "sub_events_insert_auth" ON public.submission_events FOR INSERT TO authenticated WITH CHECK (true);

-- INTERVIEWS
CREATE TABLE public.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  round public.interview_round NOT NULL DEFAULT 'l1',
  scheduled_at timestamptz,
  duration_minutes integer DEFAULT 45,
  timezone text DEFAULT 'America/New_York',
  meeting_link text,
  location text,
  interviewer_name text,
  interviewer_email text,
  outcome public.interview_outcome NOT NULL DEFAULT 'scheduled',
  score integer CHECK (score IS NULL OR (score BETWEEN 0 AND 10)),
  feedback text,
  ai_summary text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX interviews_submission_idx ON public.interviews(submission_id);
CREATE INDEX interviews_scheduled_idx ON public.interviews(scheduled_at);
CREATE INDEX interviews_outcome_idx ON public.interviews(outcome);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interviews TO authenticated;
GRANT ALL ON public.interviews TO service_role;

ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interviews_read_auth" ON public.interviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "interviews_insert_auth" ON public.interviews FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "interviews_update_auth" ON public.interviews FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "interviews_delete_admin" ON public.interviews FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TRIGGER interviews_touch BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- PLACEMENTS
CREATE TABLE public.placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE REFERENCES public.submissions(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES public.requirements(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  start_date date,
  end_date date,
  bill_rate numeric(10,2),
  pay_rate numeric(10,2),
  currency text DEFAULT 'USD',
  rate_type public.requirement_rate_type,
  margin numeric(10,2) GENERATED ALWAYS AS (COALESCE(bill_rate,0) - COALESCE(pay_rate,0)) STORED,
  status public.placement_status NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX placements_candidate_idx ON public.placements(candidate_id);
CREATE INDEX placements_requirement_idx ON public.placements(requirement_id);
CREATE INDEX placements_status_idx ON public.placements(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.placements TO authenticated;
GRANT ALL ON public.placements TO service_role;

ALTER TABLE public.placements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "placements_read_auth" ON public.placements FOR SELECT TO authenticated USING (true);
CREATE POLICY "placements_insert_auth" ON public.placements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "placements_update_auth" ON public.placements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "placements_delete_admin" ON public.placements FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TRIGGER placements_touch BEFORE UPDATE ON public.placements
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
