# Roles and permissions

The authoritative mapping is implemented in `src/lib/authorization-policy.ts` and
`src/lib/feature-access.ts`. UI labels such as L1–L4 are projections; authorization uses stored
platform and application roles.

## Visible role names

All role displays use `src/lib/role-presentation.ts`:

| Level | Visible name    | Existing stored roles                                                        |
| ----- | --------------- | ---------------------------------------------------------------------------- |
| L1    | L1 - Owner      | `platform_owner`, `platform_admin`                                           |
| L2    | L2 - Admin      | `admin`, `super_admin`                                                       |
| L3    | L3 - Developer  | `developer_admin`, `platform_support`, `account_manager`, `delivery_manager` |
| L4    | L4 - Recruiters | `recruiter`, `marketing_executive`                                           |

These are presentation aliases, not new grants or merged permissions. Existing legacy-role
capabilities remain unchanged. Protected `super_admin` options carry a `(protected)` marker to
distinguish them from ordinary Admin options. Unassigned or unknown roles display as awaiting
assignment, never as Recruiters. The top bar, sidebar and profile use the highest assigned tier.

## Platform roles

| Role               | Access                                              |
| ------------------ | --------------------------------------------------- |
| `platform_owner`   | Dashboard, platform console, audit, developer tools |
| `platform_admin`   | Dashboard, platform console, audit, developer tools |
| `platform_support` | Developer tools only                                |

Platform roles are stored separately from tenant application roles.

## Application roles

| Role                  | Main feature access                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `super_admin`         | Tenant administration plus all operational features except recruiter-only email intelligence                            |
| `admin`               | Tenant administration and operational features; may switch Admin/Recruiter roles, but cannot manage Super Admin members |
| `developer_admin`     | Developer and architecture tools                                                                                        |
| `recruiter`           | Dashboard, candidates, requirements, matching, tailoring, submissions, interviews, vendors, email intelligence          |
| `account_manager`     | Dashboard, requirements, submissions, interviews, clients, vendors, placements                                          |
| `delivery_manager`    | Dashboard, candidates, requirements, matching, submissions, interviews, vendors, placements, recruiter management       |
| `marketing_executive` | Dashboard, candidates, matching, tailoring, submissions, clients                                                        |

## Enforcement

1. Sidebar/route visibility uses the feature map for usability.
2. Server functions use authenticated feature middleware and explicit domain assertions.
3. Postgres RLS and storage policies enforce tenant and ownership constraints.

Administrators cannot modify their own authorization state. Cross-tenant user changes are rejected.
Company Team lists only L2 (`super_admin`, `admin`) and L4 (`recruiter`) memberships.
Accounts with any other application role are excluded, including mixed-role accounts.
L2 administrators can invite Admins/Recruiters and switch other Admin/Recruiter members between
those two roles. Only Super Admins may assign or modify Super Admin members. L3 and other roles
cannot be assigned or modified through Company Team, including by calling its server functions
or role-assignment RPC directly. Platform-owner onboarding of an unassigned user remains an
explicit special case for L2/L4 role assignment.
