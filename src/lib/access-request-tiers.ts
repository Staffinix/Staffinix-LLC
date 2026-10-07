import { z } from "zod";

export const REQUESTABLE_ACCESS_TIERS = ["l2_admin", "l3_developer", "l4_recruiter"] as const;

export type RequestableAccessTier = (typeof REQUESTABLE_ACCESS_TIERS)[number];

export const RequestableAccessTierSchema = z.enum(REQUESTABLE_ACCESS_TIERS);

export const ACCESS_TIER_OPTIONS: ReadonlyArray<{
  value: RequestableAccessTier;
  label: string;
}> = [
  { value: "l2_admin", label: "Admin (L2)" },
  { value: "l3_developer", label: "Developer (L3)" },
  { value: "l4_recruiter", label: "Recruiter (L4)" },
];

const ACCESS_TIER_LABELS = Object.fromEntries(
  ACCESS_TIER_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<RequestableAccessTier, string>;

export function getAccessTierLabel(tier: RequestableAccessTier): string {
  return ACCESS_TIER_LABELS[tier];
}

export function isRequestableAccessTier(value: string): value is RequestableAccessTier {
  return REQUESTABLE_ACCESS_TIERS.includes(value as RequestableAccessTier);
}

export const ACCESS_REQUEST_REASON_MIN_LENGTH = 10;
export const ACCESS_REQUEST_REASON_MAX_LENGTH = 1000;

export const AccessRequestInputSchema = z
  .object({
    requestedTier: RequestableAccessTierSchema,
    reason: z
      .string()
      .trim()
      .min(
        ACCESS_REQUEST_REASON_MIN_LENGTH,
        `Please provide at least ${ACCESS_REQUEST_REASON_MIN_LENGTH} characters.`,
      )
      .max(ACCESS_REQUEST_REASON_MAX_LENGTH),
  })
  .strict();
