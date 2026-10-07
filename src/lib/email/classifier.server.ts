import { z } from "zod";
import {
  requestStructuredAiOutput,
  UNTRUSTED_DOCUMENT_SYSTEM_RULES,
} from "@/lib/ai-gateway.server";
import type { ClassificationResult, EmailClassifier, FilterRule, NormalizedEmail } from "./types";

const ClassificationSchema = z.object({
  relevant: z.boolean(),
  category: z.string().trim().min(1).max(120),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(500),
});

function boundedEmailContent(email: NormalizedEmail): string {
  const body = (email.textBody ?? email.htmlBody?.replace(/<[^>]*>/g, " ") ?? "").slice(0, 12_000);
  return JSON.stringify({
    sender: email.from.email,
    subject: email.subject.slice(0, 500),
    body,
    attachments: email.attachments
      .map(({ filename, mimeType }) => ({ filename, mimeType }))
      .slice(0, 20),
  });
}

export class GatewayEmailClassifier implements EmailClassifier {
  async classify(email: NormalizedEmail, rule: FilterRule): Promise<ClassificationResult> {
    return ClassificationSchema.parse(
      await requestStructuredAiOutput(
        {
          model: "google/gemini-2.5-flash-lite",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `${UNTRUSTED_DOCUMENT_SYSTEM_RULES}\nClassify whether the email matches the user's recruitment filter. Return JSON only with relevant, category, confidence, and reason.`,
            },
            {
              role: "user",
              content: `Requested category: ${rule.aiCategory ?? "recruitment-relevant"}\nUser criteria: ${(rule.aiPrompt ?? "Use the configured category").slice(0, 1000)}\nUntrusted email data:\n${boundedEmailContent(email)}`,
            },
          ],
        },
        ClassificationSchema,
      ),
    );
  }
}
