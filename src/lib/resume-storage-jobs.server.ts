import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { executeResumeStorageJob } from "./resume-storage-job";

// Jobs are created by authorized database transactions; callers cannot supply paths.
export async function processResumeStorageJobs(uploadId?: string) {
  const { data: jobs, error } = await supabaseAdmin.rpc("claim_resume_storage_jobs", {
    _upload_id: uploadId,
    _limit: uploadId ? 1 : 5,
  });
  if (error) throw new Error("Unable to claim resume storage work");
  let completed = 0;
  for (const job of jobs ?? []) {
    try {
      await executeResumeStorageJob(
        job,
        {
          async download(path) {
            const { data, error } = await supabaseAdmin.storage
              .from("resume-uploads")
              .download(path);
            if (error || !data) throw new Error("Staged resume unavailable");
            return data;
          },
          async upload(path, blob, mime) {
            const { error } = await supabaseAdmin.storage
              .from("resumes")
              .upload(path, blob, { contentType: mime, upsert: true });
            if (error) throw new Error("Resume storage unavailable");
          },
          async remove(bucket, path) {
            const { error } = await supabaseAdmin.storage.from(bucket).remove([path]);
            if (error) throw new Error("Resume cleanup unavailable");
          },
        },
        async () => {
          const { error } = await supabaseAdmin.rpc("complete_resume_storage_job", {
            _id: job.id,
            _lease: job.lease!,
          });
          if (error) throw new Error("Resume finalization failed");
        },
      );
      completed++;
    } catch {
      const { error } = await supabaseAdmin.rpc("retry_resume_storage_job", {
        _id: job.id,
        _lease: job.lease!,
      });
      if (error) console.error("Resume storage retry scheduling failed");
    }
  }
  return { completed };
}

export async function finishResumeStorageBestEffort(uploadId: string) {
  try {
    const pending = (await processResumeStorageJobs(uploadId)).completed !== 1;
    if (!pending) {
      try {
        await processResumeStorageJobs(uploadId);
      } catch {
        /* Cleanup remains durable. */
      }
    }
    return pending;
  } catch {
    return true;
  }
}

export async function recordValidatedResumeUpload(uploadId: string, blob: Blob) {
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const { error } = await supabaseAdmin.rpc("record_validated_resume_upload", {
    _id: uploadId,
    _sha256: hash,
  });
  if (error) throw new Error("Unable to record validated resume");
}
