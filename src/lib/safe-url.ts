/** Return a normalized HTTP(S) URL, or null for unsafe/non-web schemes. */
export function getSafeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function isSafeHttpUrl(value: string): boolean {
  return getSafeHttpUrl(value) !== null;
}
