BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(6);

SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.role" = 'anon';
SET LOCAL "request.jwt.claim.sub" = '';

SELECT lives_ok($$INSERT INTO public.contact_us (name, phone_number, email, description)
  SELECT 'Repeat Sender', '+1 555 010 0200', 'repeat@example.invalid', 'A valid public contact request.'
  FROM generate_series(1, 3)$$, 'three requests from one email are accepted');
SELECT throws_ok($$INSERT INTO public.contact_us (name, phone_number, email, description)
  VALUES ('Repeat Sender', '+1 555 010 0200', 'repeat@example.invalid', 'A valid public contact request.')$$,
  'PT429', 'Too many contact requests. Please try again later.', 'a fourth request from the same email within an hour is rejected');
SELECT throws_ok($$INSERT INTO public.contact_us (name, phone_number, email, description, created_at)
  VALUES ('Repeat Sender', '+1 555 010 0200', 'repeat@example.invalid', 'A valid public contact request.', now() - interval '2 hours')$$,
  'PT429', 'Too many contact requests. Please try again later.', 'backdating created_at does not bypass the limit');
SELECT lives_ok($$INSERT INTO public.contact_us (name, phone_number, email, description)
  VALUES ('Other Sender', '+1 555 010 0201', 'other@example.invalid', 'A valid public contact request.')$$,
  'a different email is still accepted');
SELECT lives_ok($$INSERT INTO public.contact_us (name, phone_number, email, description)
  SELECT 'Bulk Sender', '+1 555 010 0202', 'bulk' || n || '@example.invalid', 'A valid public contact request.'
  FROM generate_series(1, 56) AS n$$, 'requests up to the global hourly limit are accepted');
SELECT throws_ok($$INSERT INTO public.contact_us (name, phone_number, email, description)
  VALUES ('One Too Many', '+1 555 010 0203', 'overflow@example.invalid', 'A valid public contact request.')$$,
  'PT429', 'Too many contact requests. Please try again later.', 'the global hourly limit rejects further requests');

SELECT * FROM finish();
ROLLBACK;
