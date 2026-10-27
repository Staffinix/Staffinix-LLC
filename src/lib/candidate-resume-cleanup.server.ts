// Called only after the authenticated candidate DELETE has succeeded.
export async function cleanupCandidateResumeFiles(candidate: { id: string; tenant_id: string }) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bucket = supabaseAdmin.storage.from("resumes");
    return await removeCandidateFiles(bucket, `${candidate.tenant_id}/${candidate.id}`);
  } catch {
    console.error("Candidate resume cleanup pending", { candidateId: candidate.id });
    return true;
  }
}

export async function removeCandidateFiles(
  bucket: {
    list: (
      prefix: string,
      options: { limit: number },
    ) => PromiseLike<{ data: Array<{ name: string; id: string | null }> | null; error: unknown }>;
    remove: (paths: string[]) => PromiseLike<{ error: unknown }>;
  },
  prefix: string,
): Promise<boolean> {
  // Delete each page before listing the next so offsets cannot skip files.
  for (let page = 0; page < 100; page++) {
    const { data, error } = await bucket.list(prefix, { limit: 100 });
    if (error || !data) return true;
    if (data.length === 0) return false;
    if (data.some((file) => !file.id || file.name.includes("/") || file.name === "..")) return true;
    const result = await bucket.remove(data.map((file) => `${prefix}/${file.name}`));
    if (result.error) return true;
  }
  return true;
}
