const PUBLIC_EMAIL_DOMAINS = new Set([
  "aol.com",
  "gmail.com",
  "googlemail.com",
  "gmx.com",
  "gmx.net",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "mail.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
  "yahoo.co.in",
  "yandex.com",
]);

export interface WorkEmailPolicyOptions {
  allowedEmails?: Iterable<string>;
  allowedDomains?: Iterable<string>;
}

function normalizeValues(values: Iterable<string> | undefined): Set<string> {
  return new Set(Array.from(values ?? [], (value) => value.trim().toLowerCase()).filter(Boolean));
}

export function parseEmailPolicyList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Allows configured business domains and rejects common consumer mailbox
 * providers. Exact exceptions are server-side configuration, never browser
 * configuration, so the exception list is not disclosed to unauthenticated users.
 */
export function isAllowedWorkEmail(
  value: string | null | undefined,
  options: WorkEmailPolicyOptions = {},
): boolean {
  const email = value?.trim().toLowerCase() ?? "";
  const separator = email.lastIndexOf("@");
  if (separator <= 0 || separator === email.length - 1 || email.includes(" ")) return false;

  const domain = email.slice(separator + 1);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return false;

  const configuredEmails = normalizeValues(options.allowedEmails);
  if (configuredEmails.has(email)) return true;

  const configuredDomains = normalizeValues(options.allowedDomains);
  if (configuredDomains.size > 0) return configuredDomains.has(domain);

  return !PUBLIC_EMAIL_DOMAINS.has(domain);
}
