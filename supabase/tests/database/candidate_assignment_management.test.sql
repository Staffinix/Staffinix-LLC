BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(40);

INSERT INTO public.tenants (id, name, slug) VALUES
  ('ca000000-0000-0000-0000-000000000001', 'Candidate Assignment A', 'candidate-assignment-a'),
  ('cb000000-0000-0000-0000-000000000002', 'Candidate Assignment B', 'candidate-assignment-b');

INSERT INTO auth.users (id, email) VALUES
  ('ca100000-0000-0000-0000-000000000001', 'assignment-admin@example.invalid'),
  ('ca200000-0000-0000-0000-000000000002', 'assignment-recruiter-a@example.invalid'),
  ('ca300000-0000-0000-0000-000000000003', 'assignment-recruiter-b@example.invalid'),
  ('cb200000-0000-0000-0000-000000000002', 'assignment-recruiter-other@example.invalid');

UPDATE public.profiles
SET tenant_id = 'ca000000-0000-0000-0000-000000000001', is_active = true
WHERE id IN (
  'ca100000-0000-0000-0000-000000000001',
  'ca200000-0000-0000-0000-000000000002',
  'ca300000-0000-0000-0000-000000000003'
);
UPDATE public.profiles
SET tenant_id = 'cb000000-0000-0000-0000-000000000002', is_active = true
WHERE id = 'cb200000-0000-0000-0000-000000000002';

INSERT INTO public.user_roles (user_id, role) VALUES
  ('ca100000-0000-0000-0000-000000000001', 'admin'),
  ('ca200000-0000-0000-0000-000000000002', 'recruiter'),
  ('ca300000-0000-0000-0000-000000000003', 'recruiter'),
  ('cb200000-0000-0000-0000-000000000002', 'recruiter');

INSERT INTO public.candidates (
  id, first_name, last_name, tenant_id, created_by, status
) VALUES
  (
    'ca110000-0000-0000-0000-000000000001', 'Assigned', 'One',
    'ca000000-0000-0000-0000-000000000001',
    'ca100000-0000-0000-0000-000000000001', 'active'
  ),
  (
    'ca120000-0000-0000-0000-000000000002', 'Assigned', 'Two',
    'ca000000-0000-0000-0000-000000000001',
    'ca100000-0000-0000-0000-000000000001', 'active'
  );

INSERT INTO public.candidate_skills (candidate_id, skill) VALUES
  ('ca110000-0000-0000-0000-000000000001', 'Recruiter A only'),
  ('ca120000-0000-0000-0000-000000000002', 'Recruiter B only');

INSERT INTO public.requirements (id, title, tenant_id, created_by) VALUES (
  'ca130000-0000-0000-0000-000000000003', 'Assignment test role',
  'ca000000-0000-0000-0000-000000000001',
  'ca100000-0000-0000-0000-000000000001'
);

SELECT has_table(
  'public', 'candidate_assignment_history',
  'candidate assignment history table exists'
); -- 1
SELECT has_table(
  'public', 'candidate_status_history',
  'candidate status history table exists'
); -- 2
SELECT has_trigger(
  'public', 'submissions', 'trg_submissions_enforce_attribution',
  'submission attribution is enforced by a database trigger'
); -- 3
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.assign_candidates_to_recruiter(uuid[],uuid)', 'EXECUTE'
  ),
  'anonymous users cannot execute candidate assignment'
); -- 4
SELECT has_trigger(
  'public', 'candidates', 'trg_candidates_enforce_assignment_on_insert',
  'initial assignment and status are validated by a database trigger'
); -- 5
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.candidates', 'status', 'UPDATE'),
  'candidate status cannot be edited directly'
); -- 6

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = 'ca100000-0000-0000-0000-000000000001';

SELECT results_eq(
  'SELECT count(*) FROM public.candidates', ARRAY[2::bigint],
  'L2 can view every candidate in its tenant'
); -- 7
SELECT results_eq(
  $$SELECT count(*) FROM public.assign_candidates_to_recruiter(
    ARRAY[
      'ca110000-0000-0000-0000-000000000001'::uuid,
      'ca120000-0000-0000-0000-000000000002'::uuid
    ],
    'ca200000-0000-0000-0000-000000000002'
  )$$,
  ARRAY[2::bigint],
  'L2 can atomically bulk-assign candidates to an active L4 recruiter'
); -- 8
SELECT results_eq(
  'SELECT count(*) FROM public.candidate_assignment_history', ARRAY[2::bigint],
  'bulk assignment writes one immutable history row per changed candidate'
); -- 9
SELECT results_eq(
  $$SELECT count(*) FROM public.candidates
    WHERE assigned_to = 'ca200000-0000-0000-0000-000000000002'
      AND assigned_by = 'ca100000-0000-0000-0000-000000000001'
      AND assigned_at IS NOT NULL$$,
  ARRAY[2::bigint],
  'bulk assignment records assignee, actor, and timestamp'
); -- 10

SET LOCAL "request.jwt.claim.sub" = 'ca200000-0000-0000-0000-000000000002';
SELECT results_eq(
  'SELECT count(*) FROM public.candidates', ARRAY[2::bigint],
  'L4 can view candidates currently assigned to them'
); -- 11
SELECT results_eq(
  'SELECT count(*) FROM public.candidate_skills', ARRAY[2::bigint],
  'L4 child-record visibility follows candidate ownership'
); -- 12
SELECT results_eq(
  'SELECT count(*) FROM public.candidate_assignment_history', ARRAY[0::bigint],
  'assignment history is restricted to L2'
); -- 13
SELECT throws_ok(
  $$INSERT INTO public.candidates (
      first_name, last_name, tenant_id, created_by, assigned_to
    ) VALUES (
      'Forged', 'Assignment',
      'ca000000-0000-0000-0000-000000000001',
      'ca200000-0000-0000-0000-000000000002',
      'ca300000-0000-0000-0000-000000000003'
    )$$,
  '42501', 'Only L2 may assign a candidate to another user',
  'L4 cannot forge an initial assignment to another recruiter'
);
SELECT throws_ok(
  $$UPDATE public.candidates
    SET status = 'placed'
    WHERE id = 'ca110000-0000-0000-0000-000000000001'$$,
  '42501', 'permission denied for table candidates',
  'L4 cannot update candidate status directly'
); -- 14
SELECT lives_ok(
  $$INSERT INTO public.submissions (
      id, requirement_id, candidate_id, tenant_id, created_by, stage,
      submitted_by, submitted_at
    ) VALUES (
      'ca140000-0000-0000-0000-000000000004',
      'ca130000-0000-0000-0000-000000000003',
      'ca110000-0000-0000-0000-000000000001',
      'ca000000-0000-0000-0000-000000000001',
      'ca200000-0000-0000-0000-000000000002',
      'submitted',
      'ca300000-0000-0000-0000-000000000003',
      '2000-01-01T00:00:00Z'
    )$$,
  'L4 can submit only a candidate currently assigned to them'
); -- 15
SELECT is(
  (SELECT submitted_by FROM public.submissions WHERE id = 'ca140000-0000-0000-0000-000000000004'),
  'ca200000-0000-0000-0000-000000000002'::uuid,
  'submission actor is derived from auth.uid rather than client input'
); -- 16
SELECT ok(
  (SELECT submitted_at > '2000-01-02T00:00:00Z' FROM public.submissions WHERE id = 'ca140000-0000-0000-0000-000000000004'),
  'submission timestamp is generated by the database'
); -- 17
SELECT is(
  (SELECT candidate_status_at_submission FROM public.submissions WHERE id = 'ca140000-0000-0000-0000-000000000004'),
  'active'::public.candidate_status,
  'submission retains the candidate status snapshot'
); -- 18
SELECT is(
  (SELECT last_submitted_by FROM public.candidates WHERE id = 'ca110000-0000-0000-0000-000000000001'),
  'ca200000-0000-0000-0000-000000000002'::uuid,
  'candidate submission summary records the authenticated submitter'
);
SELECT lives_ok(
  $$INSERT INTO public.submissions (
      id, requirement_id, candidate_id, tenant_id, created_by, stage
    ) VALUES (
      'ca150000-0000-0000-0000-000000000005',
      'ca130000-0000-0000-0000-000000000003',
      'ca120000-0000-0000-0000-000000000002',
      'ca000000-0000-0000-0000-000000000001',
      'ca200000-0000-0000-0000-000000000002',
      'hired'
    )$$,
  'L4 can create a hired submission for an assigned candidate'
);
SELECT results_eq(
  $$SELECT candidate_id FROM public.mark_candidate_placed_from_submission(
    'ca150000-0000-0000-0000-000000000005'
  )$$,
  ARRAY['ca120000-0000-0000-0000-000000000002'::uuid],
  'hired workflow may transition its assigned candidate through the scoped RPC'
);
SELECT is(
  (SELECT status FROM public.candidates WHERE id = 'ca120000-0000-0000-0000-000000000002'),
  'placed'::public.candidate_status,
  'hired workflow records the candidate as placed'
);
SELECT is(
  public.candidate_assignment_kpis() #>> '{submitted}',
  '2',
  'L4 dashboard KPI counts submitted assigned candidates'
);

SET LOCAL "request.jwt.claim.sub" = 'ca300000-0000-0000-0000-000000000003';
SELECT results_eq(
  'SELECT count(*) FROM public.candidates', ARRAY[0::bigint],
  'another L4 cannot view candidates assigned to a peer'
); -- 19
SELECT results_eq(
  'SELECT count(*) FROM public.submissions', ARRAY[0::bigint],
  'another L4 cannot view a peer candidate submission'
); -- 20
SELECT throws_ok(
  $$SELECT public.assign_candidates_to_recruiter(
    ARRAY['ca110000-0000-0000-0000-000000000001'::uuid],
    'ca300000-0000-0000-0000-000000000003'
  )$$,
  '42501', 'L2 candidate assignment permission is required',
  'L4 cannot call the assignment RPC directly'
); -- 21

SET LOCAL "request.jwt.claim.sub" = 'ca100000-0000-0000-0000-000000000001';
SELECT results_eq(
  $$SELECT new_status FROM public.update_candidate_status(
    'ca110000-0000-0000-0000-000000000001',
    'submitted',
    (SELECT updated_at FROM public.candidates WHERE id = 'ca110000-0000-0000-0000-000000000001')
  )$$,
  ARRAY['submitted'::public.candidate_status],
  'L2 can update candidate status through the concurrency-safe RPC'
); -- 22
SELECT results_eq(
  $$SELECT count(*) FROM public.candidate_status_history
    WHERE candidate_id = 'ca110000-0000-0000-0000-000000000001'$$,
  ARRAY[1::bigint],
  'status update writes immutable status history'
); -- 23
SELECT throws_ok(
  $$SELECT public.update_candidate_status(
    'ca110000-0000-0000-0000-000000000001',
    'placed',
    '2000-01-01T00:00:00Z'
  )$$,
  '40001', 'Candidate changed since it was loaded; refresh and retry',
  'a stale status edit is rejected'
); -- 24
SELECT is(
  (SELECT status FROM public.candidates WHERE id = 'ca110000-0000-0000-0000-000000000001'),
  'submitted'::public.candidate_status,
  'a rejected stale edit leaves status unchanged'
); -- 25
SELECT results_eq(
  $$SELECT count(*) FROM public.assign_candidates_to_recruiter(
    ARRAY['ca110000-0000-0000-0000-000000000001'::uuid],
    'ca300000-0000-0000-0000-000000000003'
  )$$,
  ARRAY[1::bigint],
  'L2 can reassign a candidate to another L4'
); -- 26
SELECT results_eq(
  'SELECT count(*) FROM public.candidate_assignment_history', ARRAY[3::bigint],
  'reassignment appends history instead of overwriting it'
); -- 27
SELECT is(
  (
    SELECT previous_recruiter_id
    FROM public.candidate_assignment_history
    WHERE candidate_id = 'ca110000-0000-0000-0000-000000000001'
    ORDER BY changed_at DESC LIMIT 1
  ),
  'ca200000-0000-0000-0000-000000000002'::uuid,
  'reassignment history retains the previous recruiter'
); -- 28

SET LOCAL "request.jwt.claim.sub" = 'ca200000-0000-0000-0000-000000000002';
SELECT results_eq(
  $$SELECT count(*) FROM public.candidates
    WHERE id = 'ca110000-0000-0000-0000-000000000001'$$,
  ARRAY[0::bigint],
  'previous recruiter loses candidate visibility immediately'
); -- 29
SELECT results_eq(
  $$SELECT count(*) FROM public.submissions
    WHERE id = 'ca140000-0000-0000-0000-000000000004'$$,
  ARRAY[0::bigint],
  'previous recruiter loses related submission visibility immediately'
); -- 30

SET LOCAL "request.jwt.claim.sub" = 'ca300000-0000-0000-0000-000000000003';
SELECT results_eq(
  'SELECT count(*) FROM public.candidates', ARRAY[1::bigint],
  'new recruiter gains candidate visibility immediately'
); -- 31
SELECT results_eq(
  'SELECT count(*) FROM public.submissions', ARRAY[1::bigint],
  'new recruiter gains related submission visibility immediately'
); -- 32
SELECT results_eq(
  $$SELECT count(*) FROM public.candidate_status_history
    WHERE candidate_id = 'ca110000-0000-0000-0000-000000000001'$$,
  ARRAY[1::bigint],
  'new recruiter can view status history for their assigned candidate'
); -- 33

SET LOCAL "request.jwt.claim.sub" = 'ca100000-0000-0000-0000-000000000001';
SELECT throws_ok(
  $$SELECT public.assign_candidates_to_recruiter(
    ARRAY['ca120000-0000-0000-0000-000000000002'::uuid],
    'cb200000-0000-0000-0000-000000000002'
  )$$,
  '22023', 'Eligible L4 recruiter not found',
  'L2 cannot assign a candidate to a recruiter in another tenant'
); -- 34

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
