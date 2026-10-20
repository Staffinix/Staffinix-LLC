import { z } from "zod";

const STATES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(
    " ",
  ),
);

export function isUsRequisitionLocation(value: string): boolean {
  if (/^remote(?:\s*[-,]\s*(?:usa|us|united states))?$/i.test(value.trim())) return true;
  const match = /^([^,]+),\s*([a-z]{2})(?:,\s*(?:USA|US|United States))?$/i.exec(value.trim());
  return Boolean(match && match[1].trim() && STATES.has(match[2].toUpperCase()));
}

export const UsRequisitionLocationSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine(
    isUsRequisitionLocation,
    "Enter a U.S. city and two-letter state, such as Dallas, TX, or Remote, USA.",
  );
export const UsRequisitionCurrencySchema = z.literal("USD");
