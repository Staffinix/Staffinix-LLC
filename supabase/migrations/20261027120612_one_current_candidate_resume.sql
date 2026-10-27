-- Retain historical sources, but expose at most one current original.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY candidate_id ORDER BY created_at DESC, id DESC) AS position
  FROM public.resumes WHERE is_primary
)
UPDATE public.resumes SET is_primary = false
WHERE id IN (SELECT id FROM ranked WHERE position > 1);

CREATE UNIQUE INDEX IF NOT EXISTS resumes_one_primary_per_candidate
  ON public.resumes (candidate_id) WHERE is_primary;
