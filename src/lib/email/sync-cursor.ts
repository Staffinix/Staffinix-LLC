import { z } from "zod";

const CursorSchema = z.object({
  provider: z.enum(["gmail", "microsoft"]),
  since: z.string().datetime(),
  watermark: z.string().datetime(),
  nextCursor: z.string().min(1).max(16_384),
});

export type EmailSyncCursor = z.infer<typeof CursorSchema>;

export function parseEmailSyncCursor(
  value: string | null,
  provider: "gmail" | "microsoft",
): EmailSyncCursor | null {
  if (!value) return null;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(value));
    return parsed.success && parsed.data.provider === provider ? parsed.data : null;
  } catch {
    return null;
  }
}
