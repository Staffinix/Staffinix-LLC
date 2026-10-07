export type EmailProvider = "gmail" | "microsoft";

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface NormalizedAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size?: number;
}

export interface NormalizedEmail {
  providerMessageId: string;
  providerThreadId?: string;
  accountId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  receivedAt: string;
  hasAttachments: boolean;
  attachments: NormalizedAttachment[];
}

export interface FilterRule {
  id: string;
  name: string;
  enabled: boolean;
  matchMode: "and" | "or";
  senderEmails: string[];
  senderDomains: string[];
  subjectKeywords: string[];
  subjectExact?: string | null;
  bodyKeywords: string[];
  requiredKeywords: string[];
  excludedKeywords: string[];
  requireAttachment: boolean;
  allowedAttachmentTypes: string[];
  aiEnabled: boolean;
  aiCategory?: string | null;
  aiPrompt?: string | null;
  minimumRelevanceScore: number;
}

export interface ClassificationResult {
  relevant: boolean;
  category: string;
  confidence: number;
  reason: string;
}

export interface EmailClassifier {
  classify(email: NormalizedEmail, rule: FilterRule): Promise<ClassificationResult>;
}

export interface FilterResult {
  relevant: boolean;
  score: number;
  matchedRuleId?: string;
  reasons: string[];
  checks: {
    sender: boolean;
    subject: boolean;
    keywords: boolean;
    attachment: boolean;
    ai?: boolean;
  };
  classification?: ClassificationResult;
}
