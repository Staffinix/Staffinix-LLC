const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
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
export function createCspNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
}

export function applySecurityHeaders(
  request: Request,
  response: Response,
  nonce?: string,
): Response {
  const headers = new Headers(response.headers);

  // Protect user data even if an inner handler accidentally marks it public.
  if (
    request.headers.has("authorization") ||
    request.headers.has("cookie") ||
    headers.has("set-cookie") ||
    !["GET", "HEAD", "OPTIONS"].includes(request.method) ||
    headers.get("content-type")?.toLowerCase().includes("text/html")
  ) {
    for (const header of ["cache-control", "cdn-cache-control", "vercel-cdn-cache-control"]) {
      headers.set(header, "private, no-store");
    }
    const vary = headers.get("vary");
    if (vary?.trim() !== "*") {
      const fields = (vary ?? "")
        .split(",")
        .map((field) => field.trim())
        .filter(Boolean);
      for (const field of ["Authorization", "Cookie"]) {
        if (!fields.some((existing) => existing.toLowerCase() === field.toLowerCase()))
          fields.push(field);
      }
      headers.set("vary", fields.join(", "));
    }
  }

  if (nonce && !/^[A-Za-z0-9+/]{32}$/.test(nonce)) throw new Error("Invalid CSP nonce");
  headers.set(
    "content-security-policy",
    nonce
      ? CONTENT_SECURITY_POLICY.replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`)
      : CONTENT_SECURITY_POLICY,
  );
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
