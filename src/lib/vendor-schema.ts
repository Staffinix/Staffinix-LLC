import { z } from "zod";
import { isSafeHttpUrl } from "./safe-url.ts";

export const VENDOR_STATUSES = ["prospect", "active", "inactive"] as const;
export const VENDOR_TIERS = ["a", "b", "c"] as const;

export const VendorInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  status: z.enum(VENDOR_STATUSES).default("active"),
  tier: z.enum(VENDOR_TIERS).nullable().optional(),
  contact_name: z.string().trim().max(120).nullable().optional(),
  contact_email: z
    .string()
    .trim()
    .email()
    .max(255)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  contact_phone: z.string().trim().max(40).nullable().optional(),
  linkedin_id: z.string().trim().max(255).nullable().optional(),
  contact_role: z.string().trim().max(120).nullable().optional(),
  website: z
    .string()
    .trim()
    .max(255)
    .url()
    .refine(isSafeHttpUrl, "Website must use HTTP or HTTPS")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  address: z.string().trim().max(240).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  postal_code: z.string().trim().max(24).nullable().optional(),
  tax_id: z.string().trim().max(60).nullable().optional(),
  payment_terms_days: z.number().int().min(0).max(365).nullable().optional(),
  msa_signed_at: z.string().trim().max(20).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});
