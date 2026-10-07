export const CRM_STATUSES = ["prospect", "active", "inactive"] as const;
export type CrmStatus = (typeof CRM_STATUSES)[number];

export const CRM_TIERS = ["a", "b", "c"] as const;
export type CrmTier = (typeof CRM_TIERS)[number];

export const STATUS_LABEL: Record<CrmStatus, string> = {
  prospect: "Prospect",
  active: "Active",
  inactive: "Inactive",
};

export const STATUS_STYLES: Record<CrmStatus, string> = {
  prospect: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  active: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  inactive: "bg-muted text-muted-foreground border-border",
};

export const TIER_LABEL: Record<string, string> = {
  tier_1: "Tier 1",
  tier_2: "Tier 2",
  tier_3: "Tier 3",
  enterprise: "Tier 1",
  a: "Tier 1",
  b: "Tier 2",
  c: "Tier 3",
};

export const TIER_STYLES: Record<string, string> = {
  tier_1: "bg-primary/10 text-primary border-primary/20",
  tier_2: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  tier_3: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  enterprise: "bg-primary/10 text-primary border-primary/20",
  a: "bg-primary/10 text-primary border-primary/20",
  b: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  c: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
};
