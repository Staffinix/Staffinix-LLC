import type { EmailClassifier, FilterResult, FilterRule, NormalizedEmail } from "./types";

function normalizedList(values: readonly string[]): string[] {
  return values.map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.length === 0 || needles.some((needle) => haystack.includes(needle));
}

function includesAll(haystack: string, needles: readonly string[]): boolean {
  return needles.every((needle) => haystack.includes(needle));
}

function matchesAttachmentType(email: NormalizedEmail, types: readonly string[]): boolean {
  if (types.length === 0) return true;
  return email.attachments.some((attachment) => {
    const mime = attachment.mimeType.toLowerCase();
    const filename = attachment.filename.toLowerCase();
    return types.some((type) => {
      const normalized = type.replace(/^\./, "").toLowerCase();
      return (
        mime === normalized ||
        mime.endsWith(`/${normalized}`) ||
        filename.endsWith(`.${normalized}`)
      );
    });
  });
}

export async function evaluateEmailRule(
  email: NormalizedEmail,
  rule: FilterRule,
  classifier?: EmailClassifier,
): Promise<FilterResult> {
  if (!rule.enabled) {
    return {
      relevant: false,
      score: 0,
      reasons: ["Rule is disabled"],
      checks: { sender: false, subject: false, keywords: false, attachment: false },
    };
  }

  const sender = email.from.email.trim().toLowerCase();
  const senderDomain = sender.split("@")[1] ?? "";
  const subject = email.subject.trim().toLowerCase();
  const body =
    `${email.textBody ?? ""} ${email.htmlBody?.replace(/<[^>]*>/g, " ") ?? ""}`.toLowerCase();
  const searchable = `${subject} ${body}`;
  const senderEmails = normalizedList(rule.senderEmails);
  const senderDomains = normalizedList(rule.senderDomains).map((domain) =>
    domain.replace(/^@/, ""),
  );
  const subjectKeywords = normalizedList(rule.subjectKeywords);
  const bodyKeywords = normalizedList(rule.bodyKeywords);
  const requiredKeywords = normalizedList(rule.requiredKeywords);
  const excludedKeywords = normalizedList(rule.excludedKeywords);
  const attachmentTypes = normalizedList(rule.allowedAttachmentTypes);

  const hasSenderCriteria = senderEmails.length > 0 || senderDomains.length > 0;
  const senderCheck =
    !hasSenderCriteria || senderEmails.includes(sender) || senderDomains.includes(senderDomain);
  const hasSubjectCriteria = Boolean(rule.subjectExact?.trim()) || subjectKeywords.length > 0;
  const subjectCheck =
    !hasSubjectCriteria ||
    (Boolean(rule.subjectExact?.trim()) && subject === rule.subjectExact?.trim().toLowerCase()) ||
    includesAny(subject, subjectKeywords);
  const keywordCheck =
    includesAny(body, bodyKeywords) &&
    includesAll(searchable, requiredKeywords) &&
    !excludedKeywords.some((keyword) => searchable.includes(keyword));
  const attachmentCheck =
    (!rule.requireAttachment || email.hasAttachments) &&
    matchesAttachmentType(email, attachmentTypes);

  const configuredChecks = [
    ...(hasSenderCriteria ? [senderCheck] : []),
    ...(hasSubjectCriteria ? [subjectCheck] : []),
    ...(bodyKeywords.length > 0 || requiredKeywords.length > 0 || excludedKeywords.length > 0
      ? [keywordCheck]
      : []),
    ...(rule.requireAttachment || attachmentTypes.length > 0 ? [attachmentCheck] : []),
  ];
  const deterministicMatch =
    configuredChecks.length === 0
      ? true
      : rule.matchMode === "or"
        ? configuredChecks.some(Boolean) &&
          !excludedKeywords.some((keyword) => searchable.includes(keyword))
        : configuredChecks.every(Boolean);

  const weightedChecks = [senderCheck, subjectCheck, keywordCheck, attachmentCheck];
  let score = weightedChecks.filter(Boolean).length / weightedChecks.length;
  const reasons: string[] = [];
  if (senderCheck && hasSenderCriteria) reasons.push("Sender matched");
  if (subjectCheck && hasSubjectCriteria) reasons.push("Subject matched");
  if (keywordCheck && (bodyKeywords.length > 0 || requiredKeywords.length > 0))
    reasons.push("Keywords matched");
  if (attachmentCheck && (rule.requireAttachment || attachmentTypes.length > 0))
    reasons.push("Attachment requirements matched");
  if (excludedKeywords.some((keyword) => searchable.includes(keyword)))
    reasons.push("Excluded keyword found");

  let classification;
  let aiCheck: boolean | undefined;
  if (deterministicMatch && rule.aiEnabled) {
    if (!classifier) {
      reasons.push("AI classification unavailable");
      aiCheck = false;
    } else {
      classification = await classifier.classify(email, rule);
      aiCheck = classification.relevant;
      score = score * 0.55 + classification.confidence * 0.45;
      reasons.push(classification.reason);
    }
  }

  score = Math.max(0, Math.min(1, Number(score.toFixed(3))));
  const relevant =
    deterministicMatch &&
    (!rule.aiEnabled || aiCheck === true) &&
    score >= rule.minimumRelevanceScore;
  return {
    relevant,
    score,
    matchedRuleId: relevant ? rule.id : undefined,
    reasons,
    checks: {
      sender: senderCheck,
      subject: subjectCheck,
      keywords: keywordCheck,
      attachment: attachmentCheck,
      ai: aiCheck,
    },
    classification,
  };
}

export async function evaluateEmail(
  email: NormalizedEmail,
  rules: readonly FilterRule[],
  classifier?: EmailClassifier,
): Promise<FilterResult> {
  let best: FilterResult | undefined;
  for (const rule of rules) {
    const result = await evaluateEmailRule(email, rule, classifier);
    if (!best || result.score > best.score) best = result;
    if (result.relevant) return result;
  }
  return (
    best ?? {
      relevant: false,
      score: 0,
      reasons: ["No enabled rule matched"],
      checks: { sender: false, subject: false, keywords: false, attachment: false },
    }
  );
}
