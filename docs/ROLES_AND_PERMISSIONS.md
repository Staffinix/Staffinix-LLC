# Roles and permissions

The authoritative mapping is implemented in `src/lib/authorization-policy.ts` and
`src/lib/feature-access.ts`. UI labels such as L1–L4 are projections; authorization uses stored
platform and application roles.

## Platform roles

| Role               | Access                                              |
| ------------------ | --------------------------------------------------- |
| `platform_owner`   | Dashboard, platform console, audit, developer tools |
| `platform_admin`   | Dashboard, platform console, audit, developer tools |
| `platform_support` | Developer tools only                                |

Platform roles are stored separately from tenant application roles.

## Application roles

| Role                  | Main feature access                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `super_admin`         | Tenant administration plus all operational features except recruiter-only email intelligence                      |
| `admin`               | Tenant administration and operational features; cannot grant privileged admin roles without super-admin authority |
| `developer_admin`     | Developer and architecture tools                                                                                  |
| `recruiter`           | Dashboard, candidates, requirements, matching, tailoring, submissions, interviews, vendors, email intelligence    |
| `account_manager`     | Dashboard, requirements, submissions, interviews, clients, vendors, placements                                    |
| `delivery_manager`    | Dashboard, candidates, requirements, matching, submissions, interviews, vendors, placements, recruiter management |
| `marketing_executive` | Dashboard, candidates, matching, tailoring, submissions, clients                                                  |

## Enforcement

1. Sidebar/route visibility uses the feature map for usability.
2. Server functions use authenticated feature middleware and explicit domain assertions.
3. Postgres RLS and storage policies enforce tenant and ownership constraints.

Administrators cannot modify their own authorization state. Cross-tenant user changes are rejected.
Only super administrators can assign administrator-class tenant roles. Platform-owner onboarding of
an unassigned user is handled as an explicit special case.
