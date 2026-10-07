BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(8);

SELECT has_trigger(
  'public',
  'submissions',
  'trg_submissions_record_created',
  'submission creation is recorded by a database trigger'
);

SELECT has_trigger(
  'public',
  'submissions',
  'trg_submissions_record_stage_change',
  'submission stage changes are recorded by a database trigger'
);

SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'private.record_submission_created_event()'::regprocedure),
  'submission creation event trigger is security invoker'
);

SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'private.record_submission_stage_event()'::regprocedure),
  'submission stage event trigger is security invoker'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'private.record_submission_created_event()', 'EXECUTE'),
  'authenticated clients cannot call the creation trigger function directly'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'private.record_submission_stage_event()', 'EXECUTE'),
  'authenticated clients cannot call the stage trigger function directly'
);

SELECT ok(
  NOT has_function_privilege('anon', 'private.record_submission_created_event()', 'EXECUTE'),
  'anonymous clients cannot call the creation trigger function directly'
);

SELECT ok(
  NOT has_function_privilege('anon', 'private.record_submission_stage_event()', 'EXECUTE'),
  'anonymous clients cannot call the stage trigger function directly'
);

SELECT * FROM finish();
ROLLBACK;
