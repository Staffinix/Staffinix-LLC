export function hasValidSubmissionResumeEvidence(version: {
  source_hash: string | null;
  claim_validation: unknown;
}): boolean {
  const validation = version.claim_validation;
  return (
    Boolean(version.source_hash) &&
    typeof validation === "object" &&
    validation !== null &&
    "valid" in validation &&
    validation.valid === true
  );
}
