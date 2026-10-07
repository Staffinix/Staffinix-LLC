import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireCandidatesAccess } from "@/integrations/supabase/auth-middleware";

const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

function isSafeDocumentName(value: string): boolean {
  return ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return character === "/" || character === "\\" || codePoint <= 0x1f;
  });
}

const DocumentUploadSchema = z
  .object({
    file_name: z.string().trim().min(1).max(200).refine(isSafeDocumentName, "Invalid file name"),
    mime_type: z.enum(DOCUMENT_MIME_TYPES),
    size_bytes: z
      .number()
      .int()
      .min(1)
      .max(10 * 1024 * 1024),
  })
  .strict()
  .refine(
    (value) =>
      value.file_name
        .toLowerCase()
        .endsWith(value.mime_type === "application/pdf" ? ".pdf" : ".docx"),
    "File name and document type do not match",
  );

export const createDocumentUpload = createServerFn({ method: "POST" })
  .middleware([requireCandidatesAccess])
  .validator((input: unknown) => DocumentUploadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: issued, error: issueError } = await context.supabase
      .rpc("issue_resume_upload", {
        _file_name: data.file_name,
        _mime_type: data.mime_type,
        _size_bytes: data.size_bytes,
      })
      .maybeSingle();
    if (issueError || !issued) {
      throw new Error(`Failed to authorize document upload: ${issueError?.message ?? "no grant"}`);
    }

    const { data: signed, error: signedError } = await context.supabase.storage
      .from("resume-uploads")
      .createSignedUploadUrl(issued.staging_path, { upsert: false });
    if (signedError || !signed) {
      throw new Error(`Failed to create document upload URL: ${signedError?.message ?? "no URL"}`);
    }
    return { upload_id: issued.upload_id, path: signed.path, token: signed.token };
  });
