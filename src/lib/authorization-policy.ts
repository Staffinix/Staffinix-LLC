import { ApplicationError } from "./application-error.ts";

export const APP_ROLES = [
  "super_admin",
  "admin",
  "developer_admin",
  "recruiter",
  "account_manager",
  "delivery_manager",
  "marketing_executive",
] as const;

export type AppRole = (typeof APP_ROLES)[number];
export const ASSIGNABLE_USER_ROLES = [...APP_ROLES, "platform_owner"] as const;
export type AssignableUserRole = (typeof ASSIGNABLE_USER_ROLES)[number];
export function isL1Owner(platformRole: string | null | undefined): boolean {
  return platformRole === "platform_owner" || platformRole === "platform_admin";
}

export function assertTeamAdmin(snapshot: AuthorizationSnapshot): void {
  assertActive(snapshot);
  if (!isL1Owner(snapshot.platformRole)) assertAdmin(snapshot);
}

export function assertCanAssignTeamRole(
  actor: AuthorizationSnapshot,
  role: AssignableUserRole,
): void {
  assertTeamAdmin(actor);
  if (isL1Owner(actor.platformRole)) return;
  if (!isCompanyTeamMember([role]))
    throw new ForbiddenError("Company Team can assign only L2 and L4 roles.");
  if (role === "super_admin") assertSuperAdmin(actor);
}
export const COMPANY_TEAM_ROLES = ["super_admin", "admin", "recruiter"] as const;

export function isCompanyTeamMember(roles: readonly string[]): boolean {
  return (
    roles.length > 0 &&
    roles.every((role) => COMPANY_TEAM_ROLES.some((allowed) => allowed === role))
  );
}
export type PlatformRole = "platform_owner" | "platform_admin" | "platform_support";

export interface AuthorizationSnapshot {
  active: boolean;
  tenantId: string | null;
  roles: AppRole[];
  platformRole: PlatformRole | null;
}

export class ForbiddenError extends ApplicationError {
  constructor(message = "You are not authorized to perform this operation.") {
    super("FORBIDDEN", { message });
    this.name = "ForbiddenError";
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export function assertActive(snapshot: AuthorizationSnapshot): void {
  if (!snapshot.active) throw new ForbiddenError("Inactive accounts cannot access this resource.");
}

export function assertAdmin(snapshot: AuthorizationSnapshot): void {
  assertActive(snapshot);
  if (!snapshot.roles.some((role) => role === "admin" || role === "super_admin")) {
    throw new ForbiddenError("Administrator privileges required.");
  }
}

export function assertSuperAdmin(snapshot: AuthorizationSnapshot): void {
  assertActive(snapshot);
  if (!snapshot.roles.includes("super_admin")) {
    throw new ForbiddenError("Protected L2 - Admin privileges required.");
  }
}

export function assertDeveloperAdmin(snapshot: AuthorizationSnapshot): void {
  assertActive(snapshot);
  if (
    snapshot.platformRole !== "platform_owner" &&
    snapshot.platformRole !== "platform_admin" &&
    !snapshot.roles.some(
      (role) => role === "developer_admin" || role === "super_admin" || role === "admin",
    )
  ) {
    throw new ForbiddenError("Authorized developer access required.");
  }
}

export function assertPlatformAdmin(snapshot: AuthorizationSnapshot): void {
  assertActive(snapshot);
  if (snapshot.platformRole !== "platform_owner" && snapshot.platformRole !== "platform_admin") {
    throw new ForbiddenError("L1 - Owner privileges required.");
  }
}

export function assertCanManageUser(input: {
  actor: AuthorizationSnapshot;
  actorId: string;
  targetId: string;
  targetTenantId: string | null;
  targetRoles: readonly string[];
  targetPlatformRole?: PlatformRole | null;
  assignedRole?: AssignableUserRole;
}): void {
  assertTeamAdmin(input.actor);
  if (input.actorId === input.targetId) {
    throw new ForbiddenError("You cannot modify your own authorization state.");
  }
  const canOnboardUnassignedUser =
    input.targetTenantId === null &&
    input.assignedRole !== undefined &&
    input.actor.platformRole === "platform_owner";
  if (
    !input.actor.tenantId ||
    (!canOnboardUnassignedUser && input.targetTenantId !== input.actor.tenantId)
  ) {
    throw new ForbiddenError("The target user is outside your tenant.");
  }
  if (input.assignedRole) assertCanAssignTeamRole(input.actor, input.assignedRole);
  if (isL1Owner(input.actor.platformRole)) return;
  if (input.targetPlatformRole)
    throw new ForbiddenError("Only L1 - Owner can modify platform members.");
  if (!isCompanyTeamMember(input.targetRoles)) {
    throw new ForbiddenError("Company Team can manage only L2 and L4 members.");
  }
  if (input.targetRoles.includes("super_admin") && !input.actor.roles.includes("super_admin")) {
    throw new ForbiddenError(
      "Only protected L2 - Admin accounts can modify protected administrator members.",
    );
  }
}
