-- Persist the company and administrative contact details collected during
-- platform-level tenant registration. Contacts are informational until a
-- platform administrator explicitly provisions their Auth accounts and roles.
ALTER TABLE public.tenants
  ADD COLUMN company_address text,
  ADD COLUMN tax_id text,
  ADD COLUMN owner_contact_name text,
  ADD COLUMN owner_contact_email text,
  ADD COLUMN owner_contact_phone text,
  ADD COLUMN admin_contact_name text,
  ADD COLUMN admin_contact_email text,
  ADD COLUMN admin_contact_phone text;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_company_address_length
    CHECK (company_address IS NULL OR char_length(company_address) <= 500),
  ADD CONSTRAINT tenants_tax_id_length
    CHECK (tax_id IS NULL OR char_length(tax_id) <= 80),
  ADD CONSTRAINT tenants_owner_contact_name_length
    CHECK (owner_contact_name IS NULL OR char_length(owner_contact_name) <= 120),
  ADD CONSTRAINT tenants_owner_contact_email_length
    CHECK (owner_contact_email IS NULL OR char_length(owner_contact_email) <= 255),
  ADD CONSTRAINT tenants_owner_contact_phone_length
    CHECK (owner_contact_phone IS NULL OR char_length(owner_contact_phone) <= 40),
  ADD CONSTRAINT tenants_admin_contact_name_length
    CHECK (admin_contact_name IS NULL OR char_length(admin_contact_name) <= 120),
  ADD CONSTRAINT tenants_admin_contact_email_length
    CHECK (admin_contact_email IS NULL OR char_length(admin_contact_email) <= 255),
  ADD CONSTRAINT tenants_admin_contact_phone_length
    CHECK (admin_contact_phone IS NULL OR char_length(admin_contact_phone) <= 40);
