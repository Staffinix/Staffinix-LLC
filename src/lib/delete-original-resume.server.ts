import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";
import { isCanonicalResumePathFor } from "./resume-storage-path.ts";

export async function deleteOriginalResume(
  supabase: SupabaseClient<Database>,
  input: { candidate_id: string; resume_id: string },
  removeStoredFile: (path: string) => Promise<void>,
) {
  // The user's RLS-protected DELETE authorizes the operation before service cleanup.
  const { data: removed, error } = await supabase
    .from("resumes")
    .delete()
    .eq("id", input.resume_id)
    .eq("candidate_id", input.candidate_id)
    .eq("is_primary", true)
    .select("id, tenant_id, candidate_id, file_path, mime_type")
    .maybeSingle();
  if (error?.code === "23503") {
    throw new Error(
      "This original is used by tailored versions and cannot be deleted. Upload a replacement instead.",
    );
  }
  if (error) throw new Error(`Unable to delete resume: ${error.message}`);
  if (!removed) throw new Error("Resume not found or you do not have permission to delete it.");
  const canonical = isCanonicalResumePathFor({
    path: removed.file_path,
    tenantId: removed.tenant_id,
    candidateId: removed.candidate_id,
    mimeType: removed.mime_type,
  });
  if (!canonical) return { cleanupPending: true };
  try {
    await removeStoredFile(removed.file_path);
    return { cleanupPending: false };
  } catch {
    // With the metadata removed, the private object's access policy denies new reads.
    console.error("Resume storage cleanup pending", { resumeId: removed.id });
    return { cleanupPending: true };
  }
}
