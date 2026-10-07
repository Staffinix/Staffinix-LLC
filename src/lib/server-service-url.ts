const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Validate server-controlled service endpoints before any outbound request.
 * Production fails closed when configuration is absent and requires TLS for
 * non-loopback destinations.
 */
export function getServerServiceUrl(input: {
  name: string;
  configuredValue: string | undefined;
  developmentDefault: string;
  production?: boolean;
}): string {
  const production = input.production ?? process.env.NODE_ENV === "production";
  const configured = input.configuredValue?.trim();
  if (!configured && production) {
    throw new Error(`${input.name} must be configured in production`);
  }

  let url: URL;
  try {
    url = new URL(configured || input.developmentDefault);
  } catch {
    throw new Error(`${input.name} is not a valid URL`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${input.name} must use HTTP or HTTPS`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${input.name} must not contain credentials, a query, or a fragment`);
  }
  if (url.pathname !== "/") {
    throw new Error(`${input.name} must be an origin without a path`);
  }
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`${input.name} must use HTTPS for non-loopback services`);
  }

  return url.origin;
}
