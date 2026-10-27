-- Integration test: requires two candidates. Every test write is rolled back.
BEGIN;
SELECT set_config('request.jwt.claim.sub', (SELECT created_by::text FROM public.candidates WHERE created_by IS NOT NULL LIMIT 1), true);
INSERT INTO public.vendors(name,tenant_id,created_by)
VALUES ('Temporary contact rule test A',(SELECT tenant_id FROM public.candidates WHERE created_by=auth.uid() LIMIT 1),auth.uid()),
       ('Temporary contact rule test B',(SELECT tenant_id FROM public.candidates WHERE created_by=auth.uid() LIMIT 1),auth.uid());
DO $$
DECLARE entity text; email_col text; phone_col text; ids uuid[]; blocked integer:=0;
BEGIN
 FOREACH entity IN ARRAY ARRAY['candidates','vendors'] LOOP
  email_col := CASE WHEN entity='candidates' THEN 'email' ELSE 'contact_email' END;
  phone_col := CASE WHEN entity='candidates' THEN 'phone' ELSE 'contact_phone' END;
  EXECUTE format('SELECT array_agg(id) FROM (SELECT id FROM public.%I WHERE tenant_id=$1 ORDER BY id LIMIT 2) records',entity)
  INTO ids USING (SELECT tenant_id FROM public.candidates WHERE created_by=auth.uid() LIMIT 1)::uuid;
  IF array_length(ids,1) <> 2 OR ids IS NULL THEN RAISE EXCEPTION 'Need two records for rollback test'; END IF;
  EXECUTE format('UPDATE public.%I SET %I=$1,%I=$2 WHERE id=$3',entity,email_col,phone_col)
  USING 'duplicate-rule-test-20261027@example.invalid','+14155550100',ids[1];
  -- Same record, equivalent formatting must remain editable.
  EXECUTE format('UPDATE public.%I SET %I=$1 WHERE id=$2',entity,email_col)
  USING 'DUPLICATE-RULE-TEST-20261027@EXAMPLE.INVALID',ids[1];
  BEGIN
   EXECUTE format('UPDATE public.%I SET %I=$1 WHERE id=$2',entity,email_col)
   USING '  duplicate-rule-test-20261027@example.invalid  ',ids[2];
   RAISE EXCEPTION 'Duplicate email was accepted';
  EXCEPTION WHEN unique_violation THEN blocked:=blocked+1;
  END;
  BEGIN
   EXECUTE format('UPDATE public.%I SET %I=$1 WHERE id=$2',entity,phone_col)
   USING '(415) 555-0100',ids[2];
   RAISE EXCEPTION 'Duplicate phone was accepted';
  EXCEPTION WHEN unique_violation THEN blocked:=blocked+1;
  END;
 END LOOP;
 IF blocked<>4 THEN RAISE EXCEPTION 'Expected four duplicate rejections, got %',blocked; END IF;
END $$;
ROLLBACK;
