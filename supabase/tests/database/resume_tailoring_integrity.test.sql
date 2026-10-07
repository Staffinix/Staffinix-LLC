BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(23);

SELECT has_column('public', 'resumes', 'verification_status', 'resumes record verification status');
SELECT has_column('public', 'resumes', 'verified_by', 'resumes record the human verifier');
SELECT has_column('public', 'resumes', 'verified_at', 'resumes record verification time');
SELECT has_column('public', 'resumes', 'verified_facts_hash', 'resumes bind verification to structured facts');

SELECT has_column('public', 'resume_versions', 'source_resume_id', 'tailored versions retain the verified source resume');
SELECT has_column('public', 'resume_versions', 'status', 'tailored versions have an approval status');
SELECT has_column('public', 'resume_versions', 'source_facts', 'tailored versions retain their fact snapshot');
SELECT has_column('public', 'resume_versions', 'claim_validation', 'tailored versions retain claim validation');
SELECT has_column('public', 'resume_versions', 'source_hash', 'tailored versions retain a source hash');
SELECT has_column('public', 'resume_versions', 'approved_by', 'tailored versions record the human approver');
SELECT has_column('public', 'resume_versions', 'approved_at', 'tailored versions record approval time');

SELECT has_trigger('public', 'resumes', 'resumes_verification_metadata', 'resume changes invalidate verification');
SELECT has_trigger('public', 'resume_versions', 'resume_versions_immutability', 'tailored evidence is immutable');
SELECT has_trigger('public', 'submissions', 'submissions_require_approved_resume', 'submitted records require approved evidence');

SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'private.enforce_resume_verification_metadata()'::regprocedure),
  'resume verification trigger is security invoker'
);
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'private.enforce_resume_version_immutability()'::regprocedure),
  'resume version trigger is security invoker'
);
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'private.enforce_submission_resume_approval()'::regprocedure),
  'submission approval trigger is security invoker'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'private.enforce_resume_verification_metadata()', 'EXECUTE'),
  'authenticated clients cannot invoke the verification trigger directly'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'private.enforce_resume_version_immutability()', 'EXECUTE'),
  'authenticated clients cannot invoke the immutability trigger directly'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'private.enforce_submission_resume_approval()', 'EXECUTE'),
  'authenticated clients cannot invoke the submission trigger directly'
);
SELECT ok(
  NOT has_function_privilege('anon', 'private.enforce_resume_verification_metadata()', 'EXECUTE'),
  'anonymous clients cannot invoke the verification trigger directly'
);
SELECT ok(
  NOT has_function_privilege('anon', 'private.enforce_resume_version_immutability()', 'EXECUTE'),
  'anonymous clients cannot invoke the immutability trigger directly'
);
SELECT ok(
  NOT has_function_privilege('anon', 'private.enforce_submission_resume_approval()', 'EXECUTE'),
  'anonymous clients cannot invoke the submission trigger directly'
);

SELECT * FROM finish();
ROLLBACK;
