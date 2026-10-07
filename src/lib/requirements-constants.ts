// Client-safe constants shared by requirement UI.

export const REQ_STATUSES = ["open", "closed", "expired"] as const;
export type RequirementStatus = (typeof REQ_STATUSES)[number];

export const REQ_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type RequirementPriority = (typeof REQ_PRIORITIES)[number];

export const WORK_MODES = ["onsite", "remote", "hybrid"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const RATE_TYPES = ["hourly", "annual", "monthly"] as const;
export type RateType = (typeof RATE_TYPES)[number];

export const VISA_OPTIONS = [
  "USC",
  "GC",
  "GC-EAD",
  "H1B",
  "H4-EAD",
  "L2",
  "OPT",
  "CPT",
  "TN",
  "EAD",
] as const;

export const STATUS_STYLES: Record<RequirementStatus, string> = {
  open: "bg-primary/15 text-primary border-primary/30",
  closed: "bg-success/15 text-success border-success/30",
  expired: "bg-muted text-muted-foreground border-border",
};

export const PRIORITY_STYLES: Record<RequirementPriority, string> = {
  low: "bg-muted text-muted-foreground border-border",
  medium: "bg-primary/10 text-primary border-primary/20",
  high: "bg-warning/15 text-warning border-warning/30",
  urgent: "bg-destructive/15 text-destructive border-destructive/30",
};

export const STATUS_LABEL: Record<RequirementStatus, string> = {
  open: "Open",
  closed: "Closed",
  expired: "Expired",
};

export const PRIORITY_LABEL: Record<RequirementPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export function formatRate(
  min: number | null | undefined,
  max: number | null | undefined,
  type: RateType | null | undefined,
  currency = "USD",
): string | null {
  if (min == null && max == null) return null;
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  const suffix =
    type === "hourly" ? "/hr" : type === "annual" ? "/yr" : type === "monthly" ? "/mo" : "";
  if (min != null && max != null && min !== max) return `${fmt(min)}–${fmt(max)}${suffix}`;
  return `${fmt(min ?? max!)}${suffix}`;
}
