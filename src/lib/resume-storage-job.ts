export type ResumeStorageJob = {
  id: string;
  kind: string;
  upload_id: string | null;
  resume_id: string | null;
  tenant_id: string;
  candidate_id: string;
  final_path: string;
  staging_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  lease: string | null;
  content_sha256: string | null;
};

export async function executeResumeStorageJob(
  job: ResumeStorageJob,
  storage: {
    download: (path: string) => Promise<Blob>;
    upload: (path: string, blob: Blob, mime: string) => Promise<void>;
    remove: (bucket: string, path: string) => Promise<void>;
  },
  complete: () => Promise<void>,
) {
  const escapedPrefix = `${job.tenant_id}/${job.candidate_id}/`;
  if (job.kind === "delete-staging") {
    if (
      !job.final_path.startsWith(`${job.tenant_id}/`) ||
      !/^[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f-]+\.(pdf|docx)$/.test(job.final_path)
    )
      throw new Error("Invalid staging cleanup path");
    await storage.remove("resume-uploads", job.final_path);
  } else {
    if (
      !job.final_path.startsWith(escapedPrefix) ||
      !/^[0-9a-f-]+\.(pdf|docx)$/.test(job.final_path.slice(escapedPrefix.length))
    )
      throw new Error("Invalid resume job path");
    if (job.kind === "upload") {
      if (!job.staging_path?.startsWith(`${job.tenant_id}/`) || !job.mime_type)
        throw new Error("Invalid staging job");
      const blob = await storage.download(job.staging_path);
      if (blob.size !== job.size_bytes || blob.size > 10 * 1024 * 1024)
        throw new Error("Resume size mismatch");
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== job.content_sha256) throw new Error("Staged resume changed after validation");
      await storage.upload(job.final_path, blob, job.mime_type);
    } else if (job.kind === "delete") {
      await storage.remove("resumes", job.final_path);
    } else throw new Error("Invalid storage job type");
  }
  await complete();
}
