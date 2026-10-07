export const US_PHONE_ERROR = "Please enter a valid 10-digit US phone number.";

const FRIENDLY_US_PHONE_FORMAT =
  /^(?:\+?1[ .-]?)?(?:\([2-9]\d{2}\)|[2-9]\d{2})[ .-]?[2-9]\d{2}[ .-]?\d{4}$/;

export function normalizeUsPhone(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (!FRIENDLY_US_PHONE_FORMAT.test(trimmed)) return null;

  let digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;

  const areaCode = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  if (!/^[2-9]\d{2}$/.test(areaCode) || !/^[2-9]\d{2}$/.test(exchange)) return null;
  if (areaCode.endsWith("11") || exchange.endsWith("11")) return null;

  return `+1${digits}`;
}

export function formatUsPhone(value: string | null | undefined): string {
  const normalized = normalizeUsPhone(value);
  if (!normalized) return value?.trim() ?? "";
  const digits = normalized.slice(2);
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function isValidUsPhone(value: string | null | undefined): boolean {
  return normalizeUsPhone(value) !== null;
}
