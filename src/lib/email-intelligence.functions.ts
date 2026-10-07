import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireEmailIntelligenceAccess } from "@/integrations/supabase/auth-middleware";
import { serverFunctionAuth } from "@/integrations/supabase/server-function-auth";
import { ApplicationError } from "@/lib/application-error";
import { runWithAiUsageGuard } from "@/lib/ai-usage.server";
import { GatewayEmailClassifier } from "@/lib/email/classifier.server";
import { evaluateEmail, evaluateEmailRule } from "@/lib/email/filter-engine";
import {
  getEmailAccountLoadFailure,
  type EmailProviderAvailability,
} from "@/lib/email/connection-health";
import {
  createAuthorizationUrl,
  exchangeAuthorizationCode,
  fetchProviderIdentity,
  fetchProviderMessages,
  getProviderConfigurationStatus,
  refreshProviderToken,
} from "@/lib/email/providers.server";
import {
  createSecureRandomValue,
  decryptEmailToken,
  encryptEmailToken,
  isEmailTokenEncryptionConfigured,
  sha256Base64Url,
} from "@/lib/email/token-crypto.server";
import type {
  EmailClassifier,
  EmailProvider,
  FilterRule,
  NormalizedEmail,
} from "@/lib/email/types";
import type { Database, Json } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const ProviderSchema = z.enum(["gmail", "microsoft"]);
const IdSchema = z.string().uuid();
const StringListSchema = z.array(z.string().trim().min(1).max(320)).max(50).default([]);

function resolveEmailProviderAvailability(provider: EmailProvider): EmailProviderAvailability {
  const providerStatus = getProviderConfigurationStatus(provider);
  if (!providerStatus.configured) return providerStatus;
  if (!isEmailTokenEncryptionConfigured()) {
    return { configured: false, reason: "token_encryption_missing" };
  }
  return providerStatus;
}

const RuleInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    email_account_id: IdSchema,
    name: z.string().trim().min(2).max(120),
    enabled: z.boolean().default(true),
    match_mode: z.enum(["and", "or"]).default("and"),
    sender_emails: StringListSchema,
    sender_domains: StringListSchema,
    subject_keywords: StringListSchema,
    subject_exact: z.string().trim().max(500).nullable().default(null),
    body_keywords: StringListSchema,
    required_keywords: StringListSchema,
    excluded_keywords: StringListSchema,
    require_attachment: z.boolean().default(false),
    allowed_attachment_types: z.array(z.string().trim().min(1).max(255)).max(30).default([]),
    ai_enabled: z.boolean().default(false),
    ai_category: z.string().trim().max(120).nullable().default(null),
    ai_prompt: z.string().trim().max(1000).nullable().default(null),
    minimum_relevance_score: z.number().min(0).max(1).default(0.7),
  })
  .strict();

export type EmailRuleInput = z.infer<typeof RuleInputSchema>;

type RuleRow = Database["public"]["Tables"]["email_filter_rules"]["Row"];
type AuthenticatedClient = SupabaseClient<Database>;

function toFilterRule(row: RuleRow): FilterRule {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    matchMode: row.match_mode as "and" | "or",
    senderEmails: row.sender_emails,
    senderDomains: row.sender_domains,
    subjectKeywords: row.subject_keywords,
    subjectExact: row.subject_exact,
    bodyKeywords: row.body_keywords,
    requiredKeywords: row.required_keywords,
    excludedKeywords: row.excluded_keywords,
    requireAttachment: row.require_attachment,
    allowedAttachmentTypes: row.allowed_attachment_types,
    aiEnabled: row.ai_enabled,
    aiCategory: row.ai_category,
    aiPrompt: row.ai_prompt,
    minimumRelevanceScore: row.minimum_relevance_score,
  };
}

async function getTenantId(supabase: AuthenticatedClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .single();
  if (error || !data.tenant_id) throw new ApplicationError("FORBIDDEN");
  return data.tenant_id;
}

export const getEmailDashboard = createServerFn({ method: "POST" })
  .middleware([requireEmailIntelligenceAccess])
  .validator((input: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).optional(),
        provider: z.enum(["all", "gmail", "microsoft"]).default("all"),
        account_id: z.string().uuid().optional(),
        rule_id: z.string().uuid().optional(),
        minimum_score: z.number().min(0).max(1).default(0),
        from_date: z.string().datetime().optional(),
        page: z.number().int().min(1).default(1),
        page_size: z.number().int().min(1).max(100).default(20),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;
    let query = context.supabase
      .from("selected_emails")
      .select(
        "id, email_account_id, sender_name, sender_email, subject, preview, received_at, has_attachments, matched_rule_id, relevance_score, match_reasons, match_checks, ai_category, ai_confidence, created_at",
        { count: "exact" },
      )
      .order("received_at", { ascending: false })
      .range(from, to);
    if (data.search) {
      const search = data.search.replace(/[,()%]/g, " ").trim();
      if (search)
        query = query.or(
          `subject.ilike.%${search}%,sender_email.ilike.%${search}%,sender_name.ilike.%${search}%`,
        );
    }
    if (data.account_id) query = query.eq("email_account_id", data.account_id);
    if (data.rule_id) query = query.eq("matched_rule_id", data.rule_id);
    if (data.minimum_score > 0) query = query.gte("relevance_score", data.minimum_score);
    if (data.from_date) query = query.gte("received_at", data.from_date);

    const [accounts, rules, logs] = await Promise.all([
      context.supabase
        .from("email_accounts")
        .select("id, provider, email_address, status, last_sync_at")
        .order("created_at", { ascending: true }),
      context.supabase
        .from("email_filter_rules")
        .select("id, name, enabled")
        .order("created_at", { ascending: true }),
      context.supabase
        .from("email_processing_logs")
        .select("status, created_at")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .limit(10_000),
    ]);
    if (accounts.error || rules.error || logs.error) {
      throw new ApplicationError("INTERNAL_ERROR", { message: "Unable to load Smart Email data." });
    }
    if (data.provider !== "all") {
      const providerAccountIds = (accounts.data ?? [])
        .filter((account) => account.provider === data.provider)
        .map((account) => account.id);
      query = query.in("email_account_id", providerAccountIds);
    }
    const emails = await query;
    if (emails.error) {
      throw new ApplicationError("INTERNAL_ERROR", { message: "Unable to load Smart Email data." });
    }
    const rows = emails.data ?? [];
    const processing = logs.data ?? [];
    return {
      rows,
      total: emails.count ?? 0,
      accounts: accounts.data ?? [],
      rules: rules.data ?? [],
      stats: {
        connectedAccounts: (accounts.data ?? []).filter((account) => account.status === "connected")
          .length,
        processed: processing.length,
        relevant: processing.filter((log) => log.status === "selected").length,
        ignored: processing.filter((log) => log.status === "ignored").length,
        activeRules: (rules.data ?? []).filter((rule) => rule.enabled).length,
        lastSync:
          (accounts.data ?? [])
            .map((account) => account.last_sync_at)
            .filter(Boolean)
            .sort()
            .at(-1) ?? null,
      },
    };
  });

export const listEmailAccounts = createServerFn({ method: "GET" })
  .middleware([requireEmailIntelligenceAccess])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("email_accounts")
      .select("id, provider, email_address, status, last_sync_at, last_sync_error_code, created_at")
      .order("created_at", { ascending: true });
    if (error) {
      const failure = getEmailAccountLoadFailure(error);
      throw new ApplicationError("DEPENDENCY_ERROR", {
        message: failure.message,
      });
    }
    return data ?? [];
  });

export const getEmailProviderAvailability = createServerFn({ method: "GET" })
  .middleware([requireEmailIntelligenceAccess])
  .handler(() => ({
    gmail: resolveEmailProviderAvailability("gmail"),
    microsoft: resolveEmailProviderAvailability("microsoft"),
  }));

export const beginEmailOAuth = createServerFn({ method: "POST" })
  .middleware([serverFunctionAuth, requireEmailIntelligenceAccess])
  .validator((input: unknown) => z.object({ provider: ProviderSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const availability = resolveEmailProviderAvailability(data.provider);
    if (!availability.configured) {
      throw new ApplicationError("DEPENDENCY_ERROR", {
        message: "This email provider is not configured for secure OAuth connections.",
      });
    }
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const [{ error: cleanupError }, { count: recentAttempts, error: attemptsError }] =
      await Promise.all([
        context.supabase
          .from("email_oauth_states")
          .delete()
          .lt("expires_at", new Date().toISOString()),
        context.supabase
          .from("email_oauth_states")
          .select("id", { count: "exact", head: true })
          .gte("created_at", tenMinutesAgo),
      ]);
    if (cleanupError || attemptsError) {
      throw new ApplicationError("INTERNAL_ERROR", {
        message: "Unable to start email authorization.",
      });
    }
    if ((recentAttempts ?? 0) >= 5) {
      throw new ApplicationError("RATE_LIMITED", {
        message: "Too many email connection attempts. Try again in ten minutes.",
      });
    }
    const state = createSecureRandomValue();
    const verifier = createSecureRandomValue(64);
    const [stateHash, challenge, encryptedVerifier, tenantId] = await Promise.all([
      sha256Base64Url(state),
      sha256Base64Url(verifier),
      encryptEmailToken(verifier),
      getTenantId(context.supabase, context.userId),
    ]);
    const { error } = await context.supabase.from("email_oauth_states").insert({
      user_id: context.userId,
      tenant_id: tenantId,
      provider: data.provider,
      state_hash: stateHash,
      encrypted_pkce_verifier: encryptedVerifier,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error)
      throw new ApplicationError("INTERNAL_ERROR", {
        message: "Unable to start email authorization.",
      });
    return { authorizationUrl: createAuthorizationUrl(data.provider, state, challenge) };
  });

export const completeEmailOAuth = createServerFn({ method: "POST" })
  .middleware([serverFunctionAuth, requireEmailIntelligenceAccess])
  .validator((input: unknown) =>
    z
      .object({
        provider: ProviderSchema,
        code: z.string().min(8).max(4096),
        state: z.string().min(20).max(500),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const stateHash = await sha256Base64Url(data.state);
    const { data: oauthState, error: stateError } = await context.supabase
      .from("email_oauth_states")
      .select("id, encrypted_pkce_verifier, expires_at")
      .eq("state_hash", stateHash)
      .eq("provider", data.provider)
      .maybeSingle();
    if (stateError || !oauthState || new Date(oauthState.expires_at).getTime() <= Date.now()) {
      throw new ApplicationError("FORBIDDEN", {
        message: "Email authorization state is invalid or expired.",
      });
    }
    const { data: consumedState, error: consumeError } = await context.supabase
      .from("email_oauth_states")
      .delete()
      .eq("id", oauthState.id)
      .select("id")
      .maybeSingle();
    if (consumeError || !consumedState) {
      throw new ApplicationError("FORBIDDEN", {
        message: "Email authorization state could not be consumed.",
      });
    }
    const verifier = await decryptEmailToken(oauthState.encrypted_pkce_verifier);
    const tokens = await exchangeAuthorizationCode(data.provider, data.code, verifier);
    const identity = await fetchProviderIdentity(data.provider, tokens.accessToken);
    const tenantId = await getTenantId(context.supabase, context.userId);
    const existing = await context.supabase
      .from("email_accounts")
      .select("id, encrypted_refresh_token")
      .eq("provider", data.provider)
      .eq("provider_account_id", identity.providerAccountId)
      .maybeSingle();
    if (existing.error) throw new ApplicationError("INTERNAL_ERROR");
    const encryptedAccessToken = await encryptEmailToken(tokens.accessToken);
    const encryptedRefreshToken = tokens.refreshToken
      ? await encryptEmailToken(tokens.refreshToken)
      : existing.data?.encrypted_refresh_token;
    if (!encryptedRefreshToken) {
      throw new ApplicationError("DEPENDENCY_ERROR", {
        message: "The provider did not grant offline access. Reconnect and approve offline access.",
      });
    }
    const { data: account, error } = await context.supabase
      .from("email_accounts")
      .upsert(
        {
          user_id: context.userId,
          tenant_id: tenantId,
          provider: data.provider,
          provider_account_id: identity.providerAccountId,
          email_address: identity.emailAddress,
          encrypted_access_token: encryptedAccessToken,
          encrypted_refresh_token: encryptedRefreshToken,
          token_expires_at: tokens.expiresAt,
          status: "connected",
          last_sync_error_code: null,
        },
        { onConflict: "user_id,provider,provider_account_id" },
      )
      .select("id, provider, email_address, status")
      .single();
    if (error)
      throw new ApplicationError("INTERNAL_ERROR", {
        message: "Unable to save the connected account.",
      });
    return account;
  });

export const disconnectEmailAccount = createServerFn({ method: "POST" })
  .middleware([serverFunctionAuth, requireEmailIntelligenceAccess])
  .validator((input: unknown) => z.object({ id: IdSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_accounts")
      .update({
        encrypted_access_token: await encryptEmailToken("revoked"),
        encrypted_refresh_token: null,
        token_expires_at: new Date(0).toISOString(),
        status: "disconnected",
        sync_cursor: null,
        last_sync_error_code: null,
      })
      .eq("id", data.id);
    if (error)
      throw new ApplicationError("INTERNAL_ERROR", {
        message: "Unable to disconnect the email account.",
      });
    return { success: true };
  });

export const listEmailRules = createServerFn({ method: "GET" })
  .middleware([requireEmailIntelligenceAccess])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("email_filter_rules")
      .select(
        "id, email_account_id, name, enabled, match_mode, sender_emails, sender_domains, subject_keywords, subject_exact, body_keywords, required_keywords, excluded_keywords, require_attachment, allowed_attachment_types, ai_enabled, ai_category, ai_prompt, minimum_relevance_score, created_at, updated_at",
      )
      .order("updated_at", { ascending: false });
    if (error)
      throw new ApplicationError("INTERNAL_ERROR", { message: "Unable to load filter rules." });
    return data ?? [];
  });

export const saveEmailRule = createServerFn({ method: "POST" })
  .middleware([serverFunctionAuth, requireEmailIntelligenceAccess])
  .validator((input: unknown) => RuleInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantId(context.supabase, context.userId);
    const { id, ...values } = data;
    const payload = { ...values, user_id: context.userId, tenant_id: tenantId };
    const query = id
      ? context.supabase.from("email_filter_rules").update(values).eq("id", id)
      : context.supabase.from("email_filter_rules").insert(payload);
    const { data: saved, error } = await query.select("id, name, enabled, updated_at").single();
    if (error)
      throw new ApplicationError("VALIDATION_ERROR", {
        message: "The filter rule could not be saved.",
      });
    return saved;
  });

export const deleteEmailRule = createServerFn({ method: "POST" })
  .middleware([serverFunctionAuth, requireEmailIntelligenceAccess])
  .validator((input: unknown) => z.object({ id: IdSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("email_filter_rules").delete().eq("id", data.id);
    if (error)
      throw new ApplicationError("INTERNAL_ERROR", {
        message: "Unable to delete the filter rule.",
      });
    return { success: true };
  });

const TestEmailSchema = z.object({
  from_email: z.string().email().max(320),
  subject: z.string().max(500),
  body: z.string().max(20_000),
  attachment_names: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
});

export const testEmailRule = createServerFn({ method: "POST" })
  .middleware([serverFunctionAuth, requireEmailIntelligenceAccess])
  .validator((input: unknown) =>
    z.object({ rule: RuleInputSchema, email: TestEmailSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    const email: NormalizedEmail = {
      providerMessageId: "test-message",
      accountId: data.rule.email_account_id,
      from: { email: data.email.from_email },
      to: [],
      subject: data.email.subject,
      textBody: data.email.body,
      receivedAt: new Date().toISOString(),
      hasAttachments: data.email.attachment_names.length > 0,
      attachments: data.email.attachment_names.map((filename, index) => ({
        id: `test-${index}`,
        filename,
        mimeType: filename.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : "application/octet-stream",
      })),
    };
    const rule: FilterRule = {
      id: data.rule.id ?? "test-rule",
      name: data.rule.name,
      enabled: data.rule.enabled,
      matchMode: data.rule.match_mode,
      senderEmails: data.rule.sender_emails,
      senderDomains: data.rule.sender_domains,
      subjectKeywords: data.rule.subject_keywords,
      subjectExact: data.rule.subject_exact,
      bodyKeywords: data.rule.body_keywords,
      requiredKeywords: data.rule.required_keywords,
      excludedKeywords: data.rule.excluded_keywords,
      requireAttachment: data.rule.require_attachment,
      allowedAttachmentTypes: data.rule.allowed_attachment_types,
      aiEnabled: data.rule.ai_enabled,
      aiCategory: data.rule.ai_category,
      aiPrompt: data.rule.ai_prompt,
      minimumRelevanceScore: data.rule.minimum_relevance_score,
    };
    const classifier =
      rule.aiEnabled && process.env.LOVABLE_API_KEY?.trim()
        ? {
            classify: (message: NormalizedEmail, activeRule: FilterRule) =>
              runWithAiUsageGuard(context.supabase, context.userId, "match_rationale", () =>
                new GatewayEmailClassifier().classify(message, activeRule),
              ),
          }
        : undefined;
    return evaluateEmailRule(email, rule, classifier);
  });

async function fingerprintMessageId(messageId: string): Promise<string> {
  return sha256Base64Url(messageId);
}

export const syncEmailAccount = createServerFn({ method: "POST" })
  .middleware([serverFunctionAuth, requireEmailIntelligenceAccess])
  .validator((input: unknown) => z.object({ id: IdSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantId(context.supabase, context.userId);
    const { data: account, error: accountError } = await context.supabase
      .from("email_accounts")
      .select(
        "id, provider, encrypted_access_token, encrypted_refresh_token, token_expires_at, last_sync_at, status",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (accountError || !account)
      throw new ApplicationError("NOT_FOUND", { message: "Email account not found." });
    if (account.status === "disconnected")
      throw new ApplicationError("CONFLICT", {
        message: "Reconnect this account before synchronizing.",
      });

    const { data: job, error: jobError } = await context.supabase
      .from("email_sync_jobs")
      .insert({
        user_id: context.userId,
        tenant_id: tenantId,
        email_account_id: account.id,
        status: "running",
        attempts: 1,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (jobError || !job)
      throw new ApplicationError("CONFLICT", {
        message: "This account already has a synchronization in progress.",
      });

    try {
      const provider = ProviderSchema.parse(account.provider) as EmailProvider;
      let accessToken = await decryptEmailToken(account.encrypted_access_token);
      if (new Date(account.token_expires_at).getTime() <= Date.now() + 120_000) {
        if (!account.encrypted_refresh_token) throw new Error("EMAIL_REAUTHORIZATION_REQUIRED");
        let refreshed: Awaited<ReturnType<typeof refreshProviderToken>>;
        try {
          refreshed = await refreshProviderToken(
            provider,
            await decryptEmailToken(account.encrypted_refresh_token),
          );
        } catch {
          throw new Error("EMAIL_REAUTHORIZATION_REQUIRED");
        }
        accessToken = refreshed.accessToken;
        await context.supabase
          .from("email_accounts")
          .update({
            encrypted_access_token: await encryptEmailToken(refreshed.accessToken),
            ...(refreshed.refreshToken
              ? { encrypted_refresh_token: await encryptEmailToken(refreshed.refreshToken) }
              : {}),
            token_expires_at: refreshed.expiresAt,
            status: "connected",
            last_sync_error_code: null,
          })
          .eq("id", account.id);
      }

      const { data: ruleRows, error: ruleError } = await context.supabase
        .from("email_filter_rules")
        .select(
          "id, user_id, tenant_id, email_account_id, name, enabled, match_mode, sender_emails, sender_domains, subject_keywords, subject_exact, body_keywords, required_keywords, excluded_keywords, require_attachment, allowed_attachment_types, ai_enabled, ai_category, ai_prompt, minimum_relevance_score, created_at, updated_at",
        )
        .eq("email_account_id", account.id)
        .eq("enabled", true);
      if (ruleError) throw new Error("EMAIL_RULES_UNAVAILABLE");
      const rules = (ruleRows ?? []).map(toFilterRule);
      const messages = await fetchProviderMessages(
        provider,
        account.id,
        accessToken,
        account.last_sync_at,
      );
      const gateway = new GatewayEmailClassifier();
      const classifier: EmailClassifier | undefined = process.env.LOVABLE_API_KEY?.trim()
        ? {
            classify: (message, rule) =>
              runWithAiUsageGuard(context.supabase, context.userId, "match_rationale", () =>
                gateway.classify(message, rule),
              ),
          }
        : undefined;
      let selected = 0;
      let ignored = 0;
      for (const message of messages) {
        const startedAt = Date.now();
        const result = await evaluateEmail(message, rules, classifier);
        let status: "selected" | "ignored" | "duplicate" = result.relevant ? "selected" : "ignored";
        if (result.relevant) {
          const { data: stored, error } = await context.supabase
            .from("selected_emails")
            .upsert(
              {
                user_id: context.userId,
                tenant_id: tenantId,
                email_account_id: account.id,
                provider_message_id: message.providerMessageId,
                provider_thread_id: message.providerThreadId ?? null,
                sender_name: message.from.name ?? null,
                sender_email: message.from.email,
                recipient_emails: message.to.map((recipient) => recipient.email),
                subject: message.subject.slice(0, 2000),
                preview: (message.textBody ?? message.htmlBody?.replace(/<[^>]*>/g, " ") ?? "")
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 1000),
                received_at: message.receivedAt,
                has_attachments: message.hasAttachments,
                matched_rule_id: result.matchedRuleId ?? null,
                relevance_score: result.score,
                match_reasons: result.reasons,
                match_checks: result.checks as unknown as Json,
                ai_category: result.classification?.category ?? null,
                ai_confidence: result.classification?.confidence ?? null,
              },
              { onConflict: "email_account_id,provider_message_id", ignoreDuplicates: true },
            )
            .select("id")
            .maybeSingle();
          if (error) throw new Error("EMAIL_STORE_FAILED");
          if (!stored) status = "duplicate";
          else {
            selected += 1;
            if (message.attachments.length > 0) {
              const { error: attachmentError } = await context.supabase
                .from("email_attachments")
                .upsert(
                  message.attachments.map((attachment) => ({
                    user_id: context.userId,
                    tenant_id: tenantId,
                    selected_email_id: stored.id,
                    provider_attachment_id: attachment.id,
                    filename: attachment.filename,
                    mime_type: attachment.mimeType,
                    size_bytes: attachment.size ?? null,
                  })),
                  { onConflict: "selected_email_id,provider_attachment_id" },
                );
              if (attachmentError) throw new Error("EMAIL_ATTACHMENT_METADATA_FAILED");
            }
          }
        } else ignored += 1;
        await context.supabase.from("email_processing_logs").insert({
          user_id: context.userId,
          tenant_id: tenantId,
          email_account_id: account.id,
          provider,
          provider_message_fingerprint: await fingerprintMessageId(message.providerMessageId),
          status,
          matched_rule_id: result.matchedRuleId ?? null,
          processing_duration_ms: Math.min(Date.now() - startedAt, 600_000),
        });
      }
      const completedAt = new Date().toISOString();
      await Promise.all([
        context.supabase
          .from("email_accounts")
          .update({ last_sync_at: completedAt, status: "connected", last_sync_error_code: null })
          .eq("id", account.id),
        context.supabase
          .from("email_sync_jobs")
          .update({ status: "completed", completed_at: completedAt })
          .eq("id", job.id),
      ]);
      return { processed: messages.length, selected, ignored, completedAt };
    } catch (error) {
      const code =
        error instanceof Error && /^[A-Z0-9_]{3,80}$/.test(error.message)
          ? error.message
          : "EMAIL_SYNC_FAILED";
      await Promise.all([
        context.supabase
          .from("email_accounts")
          .update({
            status:
              code === "EMAIL_REAUTHORIZATION_REQUIRED" ? "reauthorization_required" : "error",
            last_sync_error_code: code,
          })
          .eq("id", account.id),
        context.supabase
          .from("email_sync_jobs")
          .update({ status: "failed", completed_at: new Date().toISOString(), error_code: code })
          .eq("id", job.id),
      ]);
      throw new ApplicationError("DEPENDENCY_ERROR", {
        message: "Email synchronization failed. Reconnect the account if the problem continues.",
      });
    }
  });
