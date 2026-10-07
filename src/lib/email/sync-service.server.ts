import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { runWithAiUsageGuard } from "@/lib/ai-usage.server";
import { GatewayEmailClassifier } from "./classifier.server";
import { evaluateEmail } from "./filter-engine";
import { fetchProviderMessages, refreshProviderToken } from "./providers.server";
import { decryptEmailToken, encryptEmailToken, sha256Base64Url } from "./token-crypto.server";
import type { EmailClassifier, EmailProvider, FilterRule } from "./types";

type EmailClient = SupabaseClient<Database>;
type RuleRow = Database["public"]["Tables"]["email_filter_rules"]["Row"];

export interface EmailSyncResult {
  processed: number;
  selected: number;
  ignored: number;
  completedAt: string;
}

export class EmailSyncError extends Error {
  constructor(
    readonly code: string,
    message = "Email synchronization failed.",
  ) {
    super(message);
    this.name = "EmailSyncError";
  }
}

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

function getClassifier(
  supabase: EmailClient,
  userId: string,
  mode: "authenticated" | "worker",
): EmailClassifier | undefined {
  if (!process.env.LOVABLE_API_KEY?.trim()) return undefined;
  const gateway = new GatewayEmailClassifier();
  if (mode === "worker") {
    // Scheduled runs are globally bounded by the task account/message limits.
    // User-triggered runs additionally reserve the caller's database quota.
    return { classify: (message, rule) => gateway.classify(message, rule) };
  }
  return {
    classify: (message, rule) =>
      runWithAiUsageGuard(supabase, userId, "match_rationale", () =>
        gateway.classify(message, rule),
      ),
  };
}

export async function synchronizeEmailAccount(options: {
  supabase: EmailClient;
  userId: string;
  tenantId: string;
  accountId: string;
  mode: "authenticated" | "worker";
}): Promise<EmailSyncResult> {
  const { supabase, userId, tenantId, accountId, mode } = options;
  const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] =
    await Promise.all([
      supabase.from("profiles").select("id, tenant_id, is_active").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
  if (
    profileError ||
    rolesError ||
    !profile?.is_active ||
    profile.tenant_id !== tenantId ||
    !(roles ?? []).some((assignment) => assignment.role === "recruiter")
  ) {
    throw new EmailSyncError("EMAIL_L4_ACCESS_REQUIRED");
  }
  const { data: account, error: accountError } = await supabase
    .from("email_accounts")
    .select(
      "id, provider, encrypted_access_token, encrypted_refresh_token, token_expires_at, last_sync_at, status",
    )
    .eq("id", accountId)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (accountError || !account) throw new EmailSyncError("EMAIL_ACCOUNT_NOT_FOUND");
  if (account.status === "disconnected") {
    throw new EmailSyncError(
      "EMAIL_ACCOUNT_DISCONNECTED",
      "Reconnect this account before syncing.",
    );
  }

  const { data: job, error: jobError } = await supabase
    .from("email_sync_jobs")
    .insert({
      user_id: userId,
      tenant_id: tenantId,
      email_account_id: account.id,
      status: "running",
      attempts: 1,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (jobError || !job) {
    throw new EmailSyncError(
      "EMAIL_SYNC_ALREADY_RUNNING",
      "This account already has a synchronization in progress.",
    );
  }

  try {
    const provider = account.provider as EmailProvider;
    let accessToken = await decryptEmailToken(account.encrypted_access_token);
    if (new Date(account.token_expires_at).getTime() <= Date.now() + 120_000) {
      if (!account.encrypted_refresh_token)
        throw new EmailSyncError("EMAIL_REAUTHORIZATION_REQUIRED");
      let refreshed: Awaited<ReturnType<typeof refreshProviderToken>>;
      try {
        refreshed = await refreshProviderToken(
          provider,
          await decryptEmailToken(account.encrypted_refresh_token),
        );
      } catch {
        throw new EmailSyncError("EMAIL_REAUTHORIZATION_REQUIRED");
      }
      accessToken = refreshed.accessToken;
      const { error: refreshWriteError } = await supabase
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
        .eq("id", account.id)
        .eq("user_id", userId);
      if (refreshWriteError) throw new EmailSyncError("EMAIL_TOKEN_REFRESH_WRITE_FAILED");
    }

    const { data: ruleRows, error: ruleError } = await supabase
      .from("email_filter_rules")
      .select(
        "id, user_id, tenant_id, email_account_id, name, enabled, match_mode, sender_emails, sender_domains, subject_keywords, subject_exact, body_keywords, required_keywords, excluded_keywords, require_attachment, allowed_attachment_types, ai_enabled, ai_category, ai_prompt, minimum_relevance_score, created_at, updated_at",
      )
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("email_account_id", account.id)
      .eq("enabled", true);
    if (ruleError) throw new EmailSyncError("EMAIL_RULES_UNAVAILABLE");
    const rules = (ruleRows ?? []).map(toFilterRule);
    const messages = await fetchProviderMessages(
      provider,
      account.id,
      accessToken,
      account.last_sync_at,
    );
    const classifier = getClassifier(supabase, userId, mode);
    let selected = 0;
    let ignored = 0;

    for (const message of messages) {
      const startedAt = Date.now();
      const result = await evaluateEmail(message, rules, classifier);
      let status: "selected" | "ignored" | "duplicate" = result.relevant ? "selected" : "ignored";
      if (result.relevant) {
        const { data: stored, error } = await supabase
          .from("selected_emails")
          .upsert(
            {
              user_id: userId,
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
        if (error) throw new EmailSyncError("EMAIL_STORE_FAILED");
        if (!stored) status = "duplicate";
        else {
          selected += 1;
          if (message.attachments.length > 0) {
            const { error: attachmentError } = await supabase.from("email_attachments").upsert(
              message.attachments.map((attachment) => ({
                user_id: userId,
                tenant_id: tenantId,
                selected_email_id: stored.id,
                provider_attachment_id: attachment.id,
                filename: attachment.filename,
                mime_type: attachment.mimeType,
                size_bytes: attachment.size ?? null,
              })),
              { onConflict: "selected_email_id,provider_attachment_id" },
            );
            if (attachmentError) throw new EmailSyncError("EMAIL_ATTACHMENT_METADATA_FAILED");
          }
        }
      } else ignored += 1;

      const { error: logError } = await supabase.from("email_processing_logs").insert({
        user_id: userId,
        tenant_id: tenantId,
        email_account_id: account.id,
        provider,
        provider_message_fingerprint: await sha256Base64Url(message.providerMessageId),
        status,
        matched_rule_id: result.matchedRuleId ?? null,
        processing_duration_ms: Math.min(Date.now() - startedAt, 600_000),
      });
      if (logError) throw new EmailSyncError("EMAIL_PROCESSING_LOG_FAILED");
    }

    const completedAt = new Date().toISOString();
    const [accountWrite, jobWrite] = await Promise.all([
      supabase
        .from("email_accounts")
        .update({ last_sync_at: completedAt, status: "connected", last_sync_error_code: null })
        .eq("id", account.id)
        .eq("user_id", userId),
      supabase
        .from("email_sync_jobs")
        .update({ status: "completed", completed_at: completedAt })
        .eq("id", job.id)
        .eq("user_id", userId),
    ]);
    if (accountWrite.error || jobWrite.error)
      throw new EmailSyncError("EMAIL_SYNC_FINALIZE_FAILED");
    return { processed: messages.length, selected, ignored, completedAt };
  } catch (error) {
    const code = error instanceof EmailSyncError ? error.code : "EMAIL_SYNC_FAILED";
    await Promise.all([
      supabase
        .from("email_accounts")
        .update({
          status: code === "EMAIL_REAUTHORIZATION_REQUIRED" ? "reauthorization_required" : "error",
          last_sync_error_code: code,
        })
        .eq("id", account.id)
        .eq("user_id", userId),
      supabase
        .from("email_sync_jobs")
        .update({ status: "failed", completed_at: new Date().toISOString(), error_code: code })
        .eq("id", job.id)
        .eq("user_id", userId),
    ]);
    throw error instanceof EmailSyncError ? error : new EmailSyncError(code);
  }
}
