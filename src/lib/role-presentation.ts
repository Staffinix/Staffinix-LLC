import type { RoleLevel } from "../types/auth.ts";

export const ROLE_LEVEL_LABELS: Readonly<Record<RoleLevel, string>> = {
  L1: "L1 - Owner",
  L2: "L2 - Admin",
  L3: "L3 - Developer",
  L4: "L4 - Recruiters",
};

const ROLE_LEVELS: Readonly<Record<string, RoleLevel>> = {
  platform_owner: "L1",
  platform_admin: "L1",
  super_admin: "L2",
  admin: "L2",
  platform_support: "L3",
  developer_admin: "L3",
  account_manager: "L3",
  delivery_manager: "L3",
  recruiter: "L4",
  marketing_executive: "L4",
};

export function getRoleLabel(role: string | null | undefined): string {
  const level = role && Object.hasOwn(ROLE_LEVELS, role) ? ROLE_LEVELS[role] : null;
  return level ? ROLE_LEVEL_LABELS[level] : "Awaiting role assignment";
}

export function getAssignedRoleLevel(
  roles: readonly string[],
  platformRole: string | null,
): RoleLevel | null {
  const role = getAssignedRole(roles, platformRole);
  return role ? ROLE_LEVELS[role] : null;
}

export function getAssignedRole(
  roles: readonly string[],
  platformRole: string | null,
): string | null {
  return (
    Object.keys(ROLE_LEVELS).find((role) => role === platformRole || roles.includes(role)) ?? null
  );
}

export function getAssignedRoleLabel(
  roles: readonly string[],
  platformRole: string | null,
): string {
  const level = getAssignedRoleLevel(roles, platformRole);
  return level ? ROLE_LEVEL_LABELS[level] : "Awaiting role assignment";
}
