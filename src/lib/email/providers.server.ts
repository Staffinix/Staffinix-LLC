import { z } from "zod";
import type { EmailAddress, EmailProvider, NormalizedAttachment, NormalizedEmail } from "./types";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
}

export interface ProviderIdentity {
  providerAccountId: string;
  emailAddress: string;
}

type OAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };

export interface ProviderConfigurationStatus {
  configured: boolean;
  reason: "available" | "oauth_configuration_missing" | "redirect_uri_invalid";
}

type Environment = Record<string, string | undefined>;

function providerPrefix(provider: EmailProvider): "GOOGLE" | "MICROSOFT" {
  return provider === "gmail" ? "GOOGLE" : "MICROSOFT";
}

export function getProviderConfigurationStatus(
  provider: EmailProvider,
  environment: Environment = process.env,
): ProviderConfigurationStatus {
  const prefix = providerPrefix(provider);
  const clientId = environment[`${prefix}_CLIENT_ID`]?.trim();
  const clientSecret = environment[`${prefix}_CLIENT_SECRET`]?.trim();
  const redirectUri = environment[`${prefix}_EMAIL_REDIRECT_URI`]?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    return { configured: false, reason: "oauth_configuration_missing" };
  }

  try {
    const url = new URL(redirectUri);
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    const expectedProvider = provider === "gmail" ? "gmail" : "microsoft";
    if (
      (url.protocol !== "https:" && !localHttp) ||
      url.pathname !== "/settings/email-accounts/callback" ||
      url.searchParams.get("provider") !== expectedProvider
    ) {
      return { configured: false, reason: "redirect_uri_invalid" };
    }
  } catch {
    return { configured: false, reason: "redirect_uri_invalid" };
  }

  return { configured: true, reason: "available" };
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getProviderOAuthConfig(provider: EmailProvider): OAuthConfig {
  const status = getProviderConfigurationStatus(provider);
  if (!status.configured) throw new Error(`${provider} OAuth is not configured`);
  const prefix = providerPrefix(provider);
  return {
    clientId: requiredEnv(`${prefix}_CLIENT_ID`),
    clientSecret: requiredEnv(`${prefix}_CLIENT_SECRET`),
    redirectUri: requiredEnv(`${prefix}_EMAIL_REDIRECT_URI`),
  };
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) throw new Error("Email provider response was too large");
  const reader = response.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Email provider response was too large");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(combined);
  return text ? JSON.parse(text) : {};
}

async function providerFetch(url: URL | string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await readLimitedJson(response);
    if (!response.ok) throw new Error(`Email provider request failed (${response.status})`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive().max(86_400),
});

export function createAuthorizationUrl(
  provider: EmailProvider,
  state: string,
  challenge: string,
): string {
  const config = getProviderOAuthConfig(provider);
  if (provider === "gmail") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "openid email https://www.googleapis.com/auth/gmail.readonly",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    return url.toString();
  }
  const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: "openid email offline_access User.Read Mail.Read",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

function tokenEndpoint(provider: EmailProvider): string {
  return provider === "gmail"
    ? "https://oauth2.googleapis.com/token"
    : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
}

async function requestToken(
  provider: EmailProvider,
  parameters: URLSearchParams,
): Promise<OAuthTokenSet> {
  const token = TokenResponseSchema.parse(
    await providerFetch(tokenEndpoint(provider), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: parameters.toString(),
    }),
  );
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
  };
}

export async function exchangeAuthorizationCode(
  provider: EmailProvider,
  code: string,
  verifier: string,
): Promise<OAuthTokenSet> {
  const config = getProviderOAuthConfig(provider);
  return requestToken(
    provider,
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
    }),
  );
}

export async function refreshProviderToken(
  provider: EmailProvider,
  refreshToken: string,
): Promise<OAuthTokenSet> {
  const config = getProviderOAuthConfig(provider);
  return requestToken(
    provider,
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      ...(provider === "microsoft"
        ? { scope: "openid email offline_access User.Read Mail.Read" }
        : {}),
    }),
  );
}

export async function fetchProviderIdentity(
  provider: EmailProvider,
  accessToken: string,
): Promise<ProviderIdentity> {
  if (provider === "gmail") {
    const schema = z.object({ emailAddress: z.string().email(), historyId: z.string().min(1) });
    const profile = schema.parse(
      await providerFetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { authorization: `Bearer ${accessToken}` },
      }),
    );
    return {
      providerAccountId: profile.emailAddress.toLowerCase(),
      emailAddress: profile.emailAddress.toLowerCase(),
    };
  }
  const schema = z.object({
    id: z.string().min(1),
    mail: z.string().email().nullable(),
    userPrincipalName: z.string().email(),
  });
  const profile = schema.parse(
    await providerFetch("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName", {
      headers: { authorization: `Bearer ${accessToken}` },
    }),
  );
  return {
    providerAccountId: profile.id,
    emailAddress: (profile.mail ?? profile.userPrincipalName).toLowerCase(),
  };
}

function decodeBase64Url(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const padded = value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
}

type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
};

function collectGmailParts(
  part: GmailPart,
  state: { text?: string; html?: string; attachments: NormalizedAttachment[] },
): void {
  const mime = part.mimeType?.toLowerCase() ?? "application/octet-stream";
  if (part.filename && part.body?.attachmentId) {
    state.attachments.push({
      id: part.body.attachmentId,
      filename: part.filename,
      mimeType: mime,
      size: part.body.size,
    });
  } else if (mime === "text/plain" && !state.text) state.text = decodeBase64Url(part.body?.data);
  else if (mime === "text/html" && !state.html) state.html = decodeBase64Url(part.body?.data);
  for (const child of part.parts ?? []) collectGmailParts(child, state);
}

function parseAddress(value: string): EmailAddress {
  const match = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return match
    ? { name: match[1].trim() || undefined, email: match[2].trim().toLowerCase() }
    : { email: value.trim().toLowerCase() };
}

function parseAddressList(value?: string): EmailAddress[] {
  return value
    ? value
        .split(",")
        .map(parseAddress)
        .filter((address) => address.email.includes("@"))
    : [];
}

const GmailMessageSchema = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  internalDate: z.string(),
  payload: z.custom<GmailPart & { headers?: Array<{ name: string; value: string }> }>(),
});

export function normalizeGmailMessage(input: unknown, accountId: string): NormalizedEmail {
  const message = GmailMessageSchema.parse(input);
  const headers = new Map(
    (message.payload.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]),
  );
  const state: { text?: string; html?: string; attachments: NormalizedAttachment[] } = {
    attachments: [],
  };
  collectGmailParts(message.payload, state);
  return {
    providerMessageId: message.id,
    providerThreadId: message.threadId,
    accountId,
    from: parseAddress(headers.get("from") ?? "unknown@invalid.local"),
    to: parseAddressList(headers.get("to")),
    cc: parseAddressList(headers.get("cc")),
    subject: headers.get("subject") ?? "",
    textBody: state.text,
    htmlBody: state.html,
    receivedAt: new Date(Number(message.internalDate)).toISOString(),
    hasAttachments: state.attachments.length > 0,
    attachments: state.attachments,
  };
}

const GraphMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string().optional(),
  subject: z.string().nullable(),
  bodyPreview: z.string().optional(),
  body: z.object({ contentType: z.string(), content: z.string() }).optional(),
  receivedDateTime: z.string(),
  hasAttachments: z.boolean(),
  from: z
    .object({ emailAddress: z.object({ name: z.string().optional(), address: z.string() }) })
    .optional(),
  toRecipients: z
    .array(
      z.object({ emailAddress: z.object({ name: z.string().optional(), address: z.string() }) }),
    )
    .default([]),
  ccRecipients: z
    .array(
      z.object({ emailAddress: z.object({ name: z.string().optional(), address: z.string() }) }),
    )
    .default([]),
  attachments: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        contentType: z.string(),
        size: z.number().int().nonnegative().optional(),
      }),
    )
    .default([]),
});

export function normalizeMicrosoftMessage(input: unknown, accountId: string): NormalizedEmail {
  const message = GraphMessageSchema.parse(input);
  const mapAddress = (entry: {
    emailAddress: { name?: string; address: string };
  }): EmailAddress => ({
    name: entry.emailAddress.name,
    email: entry.emailAddress.address.toLowerCase(),
  });
  return {
    providerMessageId: message.id,
    providerThreadId: message.conversationId,
    accountId,
    from: message.from ? mapAddress(message.from) : { email: "unknown@invalid.local" },
    to: message.toRecipients.map(mapAddress),
    cc: message.ccRecipients.map(mapAddress),
    subject: message.subject ?? "",
    textBody:
      message.body?.contentType.toLowerCase() === "text"
        ? message.body.content
        : message.bodyPreview,
    htmlBody: message.body?.contentType.toLowerCase() === "html" ? message.body.content : undefined,
    receivedAt: new Date(message.receivedDateTime).toISOString(),
    hasAttachments: message.hasAttachments,
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.name,
      mimeType: attachment.contentType,
      size: attachment.size,
    })),
  };
}

export async function fetchProviderMessages(
  provider: EmailProvider,
  accountId: string,
  accessToken: string,
  since?: string | null,
): Promise<NormalizedEmail[]> {
  if (provider === "gmail") {
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("maxResults", "50");
    if (since)
      listUrl.searchParams.set("q", `after:${Math.floor(new Date(since).getTime() / 1000)}`);
    const list = z
      .object({ messages: z.array(z.object({ id: z.string() })).default([]) })
      .parse(await providerFetch(listUrl, { headers: { authorization: `Bearer ${accessToken}` } }));
    return Promise.all(
      list.messages.map(async ({ id }) =>
        normalizeGmailMessage(
          await providerFetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
            {
              headers: { authorization: `Bearer ${accessToken}` },
            },
          ),
          accountId,
        ),
      ),
    );
  }

  const url = new URL("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages");
  url.searchParams.set("$top", "50");
  url.searchParams.set("$orderby", "receivedDateTime asc");
  url.searchParams.set(
    "$select",
    "id,conversationId,subject,from,toRecipients,ccRecipients,body,bodyPreview,receivedDateTime,hasAttachments",
  );
  if (since)
    url.searchParams.set("$filter", `receivedDateTime gt ${new Date(since).toISOString()}`);
  const list = z.object({ value: z.array(z.unknown()) }).parse(
    await providerFetch(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.body-content-type="text"',
      },
    }),
  );
  const output: NormalizedEmail[] = [];
  for (const raw of list.value) {
    const base = GraphMessageSchema.omit({ attachments: true }).parse(raw);
    let attachments: unknown[] = [];
    if (base.hasAttachments) {
      const response = z.object({ value: z.array(z.unknown()) }).parse(
        await providerFetch(
          `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(base.id)}/attachments?$select=id,name,contentType,size,isInline`,
          {
            headers: { authorization: `Bearer ${accessToken}` },
          },
        ),
      );
      attachments = response.value;
    }
    output.push(normalizeMicrosoftMessage({ ...base, attachments }, accountId));
  }
  return output;
}
