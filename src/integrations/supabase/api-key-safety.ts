function legacyJwtRole(value: string): string | null {
  const payload = value.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const decoded = JSON.parse(atob(normalized)) as { role?: unknown };
    return typeof decoded.role === "string" ? decoded.role : null;
  } catch {
    return null;
  }
}

export function assertPublishableSupabaseKey(value: string): void {
  if (value.startsWith("sb_secret_") || legacyJwtRole(value) === "service_role") {
    throw new Error("Privileged Supabase keys are forbidden in public client configuration");
  }
}

export function isOpaquePublishableKey(value: string): boolean {
  return value.startsWith("sb_publishable_");
}
