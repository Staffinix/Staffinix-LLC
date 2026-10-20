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

| Role               | Access                                                            |
| ------------------ | ----------------------------------------------------------------- |
| `platform_owner`   | Dashboard, platform console, audit, developer tools, Company Team |
| `platform_admin`   | Dashboard, platform console, audit, developer tools, Company Team |
| `platform_support` | Developer tools only                                              |

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
For L2 callers, Company Team lists only L2 (`super_admin`, `admin`) and L4 (`recruiter`)
memberships without platform access. Accounts with other roles or platform memberships are excluded.
L2 administrators can invite Admins/Recruiters and switch other Admin/Recruiter members between
those two roles. Only protected L2 administrators may assign or modify protected L2 members.
L2 cannot grant L1/L3 access or modify an existing platform membership, including via direct RPCs.

Verified, active L1 memberships (`platform_owner` or `platform_admin`) may view all roles in
their tenant and assign any supported role to other members, even without an L2 company role.
The role dropdown offers L1 Owner, L2 Admin, L3 Developer, and L4 Recruiters. Existing legacy
variants remain visible as current access until explicitly replaced. New invitations support
L2/L3/L4; Owner access is assigned to an existing account with an explicit confirmation.

Company Team resolves each member's platform and application memberships, so an Owner who
also has a stored L2 company role displays as L1, matching the header and profile. Promoting to
L1 creates platform-wide `platform_owner` membership. Demoting to L2/L3/L4 removes platform
membership and replaces the application role atomically through `set_user_access`. The existing
`set_user_role` RPC delegates to the same checks. UI confirmation is not the security boundary;
the database validates active L1 membership, target tenancy, role allowlist, and self-change rules.

Team-list reads and role changes use the signed-in user's Supabase client; they do not require
`SUPABASE_SECRET_KEY`. Active L2 administrators may read platform membership metadata only
for their tenant so they can identify protected platform accounts. This SELECT-only policy grants
no role-management writes. Invitations and authentication-account activation/deactivation still
use the server-only admin client and require a configured server secret.

Only `platform_owner` retains the existing special case for onboarding an unassigned profile.
Neither L1 nor L2 may change their own role or modify an existing user in another tenant.
