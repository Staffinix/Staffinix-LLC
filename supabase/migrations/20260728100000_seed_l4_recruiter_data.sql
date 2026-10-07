-- Production migrations must not create demo tenants, fake profiles, or role
-- memberships. The former contents generated a profile UUID without a matching
-- auth.users row, broke clean database builds, and bypassed the real signup
-- boundary. Development fixtures belong in an explicitly invoked local seed.
--
-- This intentionally remains a no-op so existing migration history is stable.
SELECT 1;
