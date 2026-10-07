const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // TanStack Start currently emits an inline hydration bootstrap. Keep this
  // exception scoped to scripts while preventing third-party script origins.
  "script-src 'self' 'unsafe-inline'",
  // Tailwind/Radix/React use style attributes and the application embeds fonts.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

function requestUsesHttps(request: Request): boolean {
  if (new URL(request.url).protocol === "https:") return true;

  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  return forwardedProtocol?.split(",", 1)[0]?.trim().toLowerCase() === "https";
}

/**
 * Apply browser security headers at the outermost server boundary so they are
 * present on successful pages, server-function responses, and error responses.
 */
export function applySecurityHeaders(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);

  headers.set("content-security-policy", CONTENT_SECURITY_POLICY);
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");

  if (requestUsesHttps(request)) {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  } else {
    headers.delete("strict-transport-security");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export { CONTENT_SECURITY_POLICY };
