-- Keep existing duplicate records; reject newly introduced contact conflicts.
CREATE OR REPLACE FUNCTION private.contact_phone_key(value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
 SELECT CASE WHEN length(digits)=10 THEN '1'||digits ELSE nullif(digits,'') END
 FROM (SELECT regexp_replace(coalesce(value,''),'[^0-9]','','g') AS digits) normalized
$$;

CREATE OR REPLACE FUNCTION private.prevent_duplicate_contacts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 new_email text; new_phone text; old_email text; old_phone text;
 email_changed boolean; phone_changed boolean; conflict_found boolean;
BEGIN
 IF auth.uid() IS NULL THEN
   RAISE EXCEPTION 'Sign in before changing contact information' USING ERRCODE='42501';
 END IF;
 new_email := nullif(lower(btrim(to_jsonb(NEW)->>TG_ARGV[0])),'');
 new_phone := private.contact_phone_key(to_jsonb(NEW)->>TG_ARGV[1]);
 IF TG_OP='UPDATE' THEN
   old_email := nullif(lower(btrim(to_jsonb(OLD)->>TG_ARGV[0])),'');
   old_phone := private.contact_phone_key(to_jsonb(OLD)->>TG_ARGV[1]);
 END IF;
 email_changed := TG_OP='INSERT' OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR new_email IS DISTINCT FROM old_email;
 phone_changed := TG_OP='INSERT' OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR new_phone IS DISTINCT FROM old_phone;
 IF NOT email_changed AND NOT phone_changed THEN RETURN NEW; END IF;
 -- Serialize contact writes within this tenant and entity type, including imports.
 IF current_setting('transaction_isolation') <> 'read committed' THEN
   RAISE EXCEPTION 'Contact changes require a read committed transaction' USING ERRCODE='40001';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(TG_TABLE_NAME||':'||NEW.tenant_id::text,0));
 IF email_changed AND new_email IS NOT NULL THEN
   EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE tenant_id=$1 AND id<>$2 AND nullif(lower(btrim(%I)),'''')=$3)',TG_TABLE_NAME,TG_ARGV[0])
   INTO conflict_found USING NEW.tenant_id,NEW.id,new_email;
   IF conflict_found THEN
     RAISE EXCEPTION 'This email address is already used by another %.',TG_ARGV[2] USING ERRCODE='23505';
   END IF;
 END IF;
 IF phone_changed AND new_phone IS NOT NULL THEN
   EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE tenant_id=$1 AND id<>$2 AND private.contact_phone_key(%I)=$3)',TG_TABLE_NAME,TG_ARGV[1])
   INTO conflict_found USING NEW.tenant_id,NEW.id,new_phone;
   IF conflict_found THEN
     RAISE EXCEPTION 'This phone number is already used by another %.',TG_ARGV[2] USING ERRCODE='23505';
   END IF;
 END IF;
 RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.prevent_duplicate_contacts() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER zz_candidates_unique_contact_changes
BEFORE INSERT OR UPDATE OF email,phone,tenant_id ON public.candidates
FOR EACH ROW EXECUTE FUNCTION private.prevent_duplicate_contacts('email','phone','candidate');
CREATE TRIGGER zz_vendors_unique_contact_changes
BEFORE INSERT OR UPDATE OF contact_email,contact_phone,tenant_id ON public.vendors
FOR EACH ROW EXECUTE FUNCTION private.prevent_duplicate_contacts('contact_email','contact_phone','vendor');

