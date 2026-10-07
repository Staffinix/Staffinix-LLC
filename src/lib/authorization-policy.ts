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
    throw new ForbiddenError("Super administrator privileges required.");
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
    throw new ForbiddenError("Developer administrator privileges required.");
  }
}

export function assertPlatformAdmin(snapshot: AuthorizationSnapshot): void {
  assertActive(snapshot);
  if (snapshot.platformRole !== "platform_owner" && snapshot.platformRole !== "platform_admin") {
    throw new ForbiddenError("Platform administrator privileges required.");
  }
}

export function assertCanManageUser(input: {
  actor: AuthorizationSnapshot;
  actorId: string;
  targetId: string;
  targetTenantId: string | null;
  assignedRole?: AppRole;
}): void {
  assertAdmin(input.actor);
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
  if (
    input.assignedRole &&
    (input.assignedRole === "admin" ||
      input.assignedRole === "super_admin" ||
      input.assignedRole === "developer_admin") &&
    !input.actor.roles.includes("super_admin")
  ) {
    throw new ForbiddenError("Only super administrators can assign administrator roles.");
  }
}
