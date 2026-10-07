const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_V4_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

const CANONICAL_RESUME_PATH = new RegExp(
  `^(${UUID_PATTERN})/(${UUID_PATTERN})/(${UUID_V4_PATTERN})\\.(pdf|docx)$`,
  "i",
);

const EXTENSION_BY_MIME: Record<string, "pdf" | "docx"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function isCanonicalResumePathFor(input: {
  path: string;
  tenantId: string;
  candidateId: string;
  mimeType: string | null;
}): boolean {
  const match = CANONICAL_RESUME_PATH.exec(input.path);
  const expectedExtension = input.mimeType ? EXTENSION_BY_MIME[input.mimeType] : undefined;

  return Boolean(
    match &&
    expectedExtension &&
    match[1].toLowerCase() === input.tenantId.toLowerCase() &&
    match[2].toLowerCase() === input.candidateId.toLowerCase() &&
    match[4].toLowerCase() === expectedExtension,
  );
}
