import assert from "node:assert/strict";
import test from "node:test";
import { evaluateEmailRule } from "./filter-engine.ts";
import type { FilterRule, NormalizedEmail } from "./types.ts";

const email: NormalizedEmail = {
  providerMessageId: "message-1",
  accountId: "account-1",
  from: { name: "LinkedIn", email: "jobs@linkedin.com" },
  to: [{ email: "recruiter@staffinix.com" }],
  subject: "New developer application",
  textBody: "A React candidate attached a resume for review.",
  receivedAt: "2026-09-30T08:00:00.000Z",
  hasAttachments: true,
  attachments: [{ id: "a1", filename: "resume.pdf", mimeType: "application/pdf" }],
};

const rule: FilterRule = {
  id: "rule-1",
  name: "Applications",
  enabled: true,
  matchMode: "and",
  senderEmails: [],
  senderDomains: ["linkedin.com"],
  subjectKeywords: ["application"],
  bodyKeywords: ["resume"],
  requiredKeywords: ["candidate"],
  excludedKeywords: ["unsubscribe-only"],
  requireAttachment: true,
  allowedAttachmentTypes: ["pdf"],
  aiEnabled: false,
  minimumRelevanceScore: 0.7,
};

test("matches sender domain, subject, keywords, and attachment metadata", async () => {
  const result = await evaluateEmailRule(email, rule);
  assert.equal(result.relevant, true);
  assert.equal(result.score, 1);
  assert.equal(result.matchedRuleId, "rule-1");
});

test("excluded keywords fail a deterministic match", async () => {
  const result = await evaluateEmailRule(
    { ...email, textBody: `${email.textBody} unsubscribe-only` },
    rule,
  );
  assert.equal(result.relevant, false);
  assert.equal(result.checks.keywords, false);
});

test("AI is called only after deterministic checks pass", async () => {
  let calls = 0;
  const result = await evaluateEmailRule(
    email,
    { ...rule, aiEnabled: true },
    {
      async classify() {
        calls += 1;
        return {
          relevant: true,
          category: "job_application",
          confidence: 0.95,
          reason: "Recruitment application",
        };
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.relevant, true);

  await evaluateEmailRule(
    { ...email, from: { email: "other.example" } },
    { ...rule, aiEnabled: true },
    {
      async classify() {
        calls += 1;
        return { relevant: true, category: "x", confidence: 1, reason: "x" };
      },
    },
  );
  assert.equal(calls, 1);
});
