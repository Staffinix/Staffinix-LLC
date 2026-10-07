import type { EmailProvider } from "./types";

export type EmailProviderUnavailableReason =
  "available" | "oauth_configuration_missing" | "redirect_uri_invalid" | "token_encryption_missing";

export interface EmailProviderAvailability {
  configured: boolean;
  reason: EmailProviderUnavailableReason;
}

export function getEmailAccountLoadFailure(error: unknown): {
  code: "database_setup_incomplete" | "temporarily_unavailable";
  message: string;
} {
  const databaseCode =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (["42P01", "PGRST204", "PGRST205"].includes(databaseCode)) {
    return {
      code: "database_setup_incomplete",
      message: "Smart Email database setup is incomplete. Apply the required migration and retry.",
    };
  }
  return {
    code: "temporarily_unavailable",
    message: "Connected email accounts are temporarily unavailable. Please retry.",
  };
}

export function getProviderUnavailableMessage(
  provider: EmailProvider,
  reason: EmailProviderUnavailableReason,
): string | null {
  if (reason === "available") return null;
  const label = provider === "gmail" ? "Gmail" : "Microsoft Outlook";
  if (reason === "token_encryption_missing") {
    return "Secure credential storage is not configured.";
  }
  if (reason === "redirect_uri_invalid") {
    return `${label} has an invalid callback URL configuration.`;
  }
  return `${label} OAuth credentials are not configured.`;
}
