/** Copy by public fields: dev-server Request proxies fail Node's private-brand checks. */
export function forwardRequest(request: Request, headers: Headers): Request {
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    signal: request.signal,
    redirect: request.redirect,
  };
  if (request.method !== "GET" && request.method !== "HEAD" && request.body !== null) {
    init.body = request.body;
    init.duplex = "half";
  }
  return new Request(request.url, init);
}
