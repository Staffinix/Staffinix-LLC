import type { AppRole, PlatformRole } from "@/lib/authorization-policy";

export const FEATURES = [
  "dashboard",
  "platform",
  "audit",
  "users",
  "developer",
  "candidates",
  "requirements",
  "matching",
  "tailoring",
  "submissions",
  "interviews",
  "clients",
  "vendors",
  "placements",
  "recruiters",
  "email_intelligence",
] as const;

export type Feature = (typeof FEATURES)[number];

export interface FeatureAccessIdentity {
  roles: readonly string[];
  platformRole: string | null;
}

const DASHBOARD_ROLES: readonly AppRole[] = [
  "super_admin",
  "admin",
  "recruiter",
  "account_manager",
  "delivery_manager",
  "marketing_executive",
];

const FEATURE_ROLES: Record<Feature, readonly AppRole[]> = {
  dashboard: DASHBOARD_ROLES,
  platform: [],
  audit: ["super_admin", "admin"],
  users: ["super_admin", "admin"],
  developer: ["developer_admin"],
  candidates: ["super_admin", "admin", "recruiter", "delivery_manager", "marketing_executive"],
  requirements: ["super_admin", "admin", "recruiter", "account_manager", "delivery_manager"],
  matching: ["super_admin", "admin", "recruiter", "delivery_manager", "marketing_executive"],
  tailoring: ["super_admin", "admin", "recruiter", "marketing_executive"],
  submissions: [
    "super_admin",
    "admin",
    "recruiter",
    "account_manager",
    "delivery_manager",
    "marketing_executive",
  ],
  interviews: ["super_admin", "admin", "recruiter", "account_manager", "delivery_manager"],
  clients: ["super_admin", "admin", "account_manager", "marketing_executive"],
  vendors: ["super_admin", "admin", "recruiter", "account_manager", "delivery_manager"],
  placements: ["super_admin", "admin", "account_manager", "delivery_manager"],
  recruiters: ["super_admin", "admin", "delivery_manager"],
  email_intelligence: ["recruiter"],
};

const PLATFORM_FEATURES: Record<PlatformRole, readonly Feature[]> = {
  platform_owner: ["dashboard", "platform", "audit", "developer"],
  platform_admin: ["dashboard", "platform", "audit", "developer"],
  platform_support: ["developer"],
};

const PATH_FEATURES: ReadonlyArray<readonly [prefix: string, feature: Feature]> = [
  ["/settings/email-accounts", "email_intelligence"],
  ["/email-intelligence", "email_intelligence"],
  ["/tenants", "platform"],
  ["/platform", "platform"],
  ["/architecture", "developer"],
  ["/developer", "developer"],
  ["/settings", "dashboard"],
  ["/dashboard", "dashboard"],
  ["/overview", "dashboard"],
  ["/copilot", "dashboard"],
  ["/candidates", "candidates"],
  ["/bench", "candidates"],
  ["/requirements", "requirements"],
  ["/matching", "matching"],
  ["/tailoring", "tailoring"],
  ["/submissions", "submissions"],
  ["/interviews", "interviews"],
  ["/clients", "clients"],
  ["/vendors", "vendors"],
  ["/placements", "placements"],
  ["/recruiters", "recruiters"],
  ["/users", "users"],
  ["/company", "users"],
  ["/audit", "audit"],
];

export function canAccessFeature(identity: FeatureAccessIdentity, feature: Feature): boolean {
  if (identity.roles.some((role) => FEATURE_ROLES[feature].includes(role as AppRole))) {
    return true;
  }

  const platformRole = identity.platformRole as PlatformRole | null;
  return platformRole ? PLATFORM_FEATURES[platformRole]?.includes(feature) === true : false;
}

export function getFeatureForPath(pathname: string): Feature | null {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const match = PATH_FEATURES.find(
    ([prefix]) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );
  return match?.[1] ?? null;
}

export function canAccessPath(identity: FeatureAccessIdentity, pathname: string): boolean {
  if (
    pathname === "/access-request" ||
    pathname === "/forbidden" ||
    pathname === "/overview" ||
    pathname === "/settings/profile"
  ) {
    return true;
  }
  const feature = getFeatureForPath(pathname);
  return feature === null || canAccessFeature(identity, feature);
}

export function getDefaultAuthorizedPath(identity: FeatureAccessIdentity): string {
  if (canAccessFeature(identity, "dashboard")) return "/dashboard";
  if (canAccessFeature(identity, "developer")) return "/developer";
  return "/access-request";
}

export function getFeatureRoles(feature: Feature): readonly AppRole[] {
  return FEATURE_ROLES[feature];
}
