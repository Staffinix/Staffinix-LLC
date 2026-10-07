-- ============================================================
-- 1. Add developer_admin role to enum type
-- ============================================================

ALTER TYPE public.app_role
ADD VALUE IF NOT EXISTS 'developer_admin';
