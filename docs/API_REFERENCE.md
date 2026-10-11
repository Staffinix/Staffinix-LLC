# API reference

Staffinix does not expose a separate Express REST service. Its application API is implemented with
TanStack Start `createServerFn` modules. Inputs are validated at each function boundary and calls
use the authenticated Supabase session.

## Server-function modules

| Area                            | Module                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Access requests                 | `src/lib/access-requests.functions.ts`                                                           |
| Candidates and resumes          | `src/lib/candidates.functions.ts`                                                                |
| Candidate assignment/management | `src/lib/candidate-management.functions.ts`                                                      |
| Requirements                    | `src/lib/requirements.functions.ts`                                                              |
| AI matching                     | `src/features/ai-matching/matching.functions.ts`                                                 |
| Resume tailoring                | `src/lib/tailoring.functions.ts`                                                                 |
| Submissions/pipeline            | `src/lib/submissions.functions.ts`                                                               |
| Clients/vendors                 | `src/lib/clients.functions.ts`, `src/lib/vendors.functions.ts`                                   |
| Recruiters/users                | `src/lib/recruiters.functions.ts`, `src/lib/users.functions.ts`                                  |
| Interviews/placements           | `src/lib/interviews.functions.ts`, `src/lib/placements.functions.ts`                             |
| Dashboard/Copilot               | `src/lib/dashboard.functions.ts`, `src/lib/copilot.functions.ts`                                 |
| Smart email                     | `src/lib/email-intelligence.functions.ts`                                                        |
| Tenant/profile/developer        | `src/lib/tenancy.functions.ts`, `src/lib/profile.functions.ts`, `src/lib/developer.functions.ts` |
| Contact/document upload         | `src/lib/contact-us.functions.ts`, `src/lib/document-upload.functions.ts`                        |

Use the exported typed functions from route/components rather than constructing internal URLs.

## External services

- Supabase Auth/Postgres/Storage
- Gmail and Microsoft OAuth/email APIs
- OpenRouter or Lovable AI gateway (optional server providers)
- Qdrant and Ollama for tenant-filtered local RAG
- Private document processor and ClamAV

OAuth callbacks terminate at `/settings/email-accounts/callback?provider=<provider>`. Provider
credentials and token-encryption keys are server-only.

## Errors and observability

Public errors use the application error taxonomy. Request logs carry request IDs and allowlisted
metadata; tokens, passwords, resume bodies, and provider secrets must not be logged.
