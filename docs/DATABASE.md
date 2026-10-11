# Database

Supabase provides Auth, Postgres, Storage, and caller-scoped access through Row Level Security.
Database state is defined by the ordered SQL files in `supabase/migrations`; generated TypeScript
types live in `src/integrations/supabase/types.ts`.

## Domain groups

- Identity/tenancy: `profiles`, `user_roles`, `platform_admins`, `tenants`
- Operations: `clients`, `vendors`, `requirements`, `requirement_skills`, `candidates`
- Candidate graph: skills, employment, education, projects, certifications, assignment/status history
- Documents/AI: `resumes`, `resume_versions`, candidate/requirement embeddings, private job/grant tables
- Delivery: `submissions`, `submission_events`, `interviews`, `placements`
- Email intelligence: accounts, OAuth states, rules, attachments, selected messages, processing/sync logs
- Governance: `audit_logs`, `api_keys`, workflow settings, access requests, AI usage buckets
- Copilot/public intake: `copilot_messages`, `contact_us`

## Security model

- RLS is enabled on exposed tenant-owned tables.
- Policies derive identity from `auth.uid()` and tenant membership from database state.
- `private` schema helpers and security-definer functions reduce policy duplication.
- Tenant-integrity triggers reject inconsistent parent/child tenant relationships.
- Storage object paths are canonical and tenant/candidate scoped.
- Service-role access is server-only and guarded against browser bundling.

Application RBAC supplements RLS but never replaces it. Both grants and RLS policies must allow an
operation.

## Making a change

1. Add a new timestamped migration; never edit an applied migration.
2. Include RLS/policies and grants for every exposed object.
3. Preserve tenant integrity and set safe `search_path` values on privileged functions.
4. Regenerate Supabase types if the public contract changes.
5. Add adversarial tests under `supabase/tests/database`.
6. Run the local database test command from [Development](DEVELOPMENT.md).

Do not use the dashboard to make untracked production schema changes.
