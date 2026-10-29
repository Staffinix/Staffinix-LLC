import assert from "node:assert/strict";
import test from "node:test";
import { executeResumeStorageJob, type ResumeStorageJob } from "./resume-storage-job.ts";
const job: ResumeStorageJob = {
  id: "j",
  kind: "upload",
  upload_id: "u",
  resume_id: "r",
  tenant_id: "aaaa",
  candidate_id: "bbbb",
  final_path: "aaaa/bbbb/cccc.pdf",
  staging_path: "aaaa/dddd/eeee.pdf",
  mime_type: "application/pdf",
  size_bytes: 3,
  lease: "lease",
  content_sha256: "c35b21d6ca39aa7cc3b79a705d989f1a6e88b99ab43988d74048799e3db926a3",
};
test("file must be stored before the metadata can become current", async () => {
  const calls: string[] = [];
  await executeResumeStorageJob(
    job,
    {
      download: async () => new Blob(["pdf"]),
      upload: async () => {
        calls.push("stored");
      },
      remove: async () => {
        throw new Error("must retain staged input until completion");
      },
    },
    async () => {
      calls.push("finalized");
    },
  );
  assert.deepEqual(calls, ["stored", "finalized"]);
});
test("storage failure never finalizes metadata and retains retry input", async () => {
  await assert.rejects(
    executeResumeStorageJob(
      job,
      {
        download: async () => new Blob(["pdf"]),
        upload: async () => {
          throw new Error("offline");
        },
        remove: async () => {
          assert.fail();
        },
      },
      async () => {
        assert.fail();
      },
    ),
    /offline/,
  );
});
test("size mismatch and unsafe paths cannot write files", async () => {
  for (const input of [
    { ...job, size_bytes: 4 },
    { ...job, final_path: "aaaa/bbbb/../other.pdf" },
  ]) {
    await assert.rejects(
      executeResumeStorageJob(
        input,
        {
          download: async () => new Blob(["pdf"]),
          upload: async () => {
            assert.fail();
          },
          remove: async () => {
            assert.fail();
          },
        },
        async () => {
          assert.fail();
        },
      ),
    );
  }
});
test("deletion failures keep the durable job pending", async () => {
  await assert.rejects(
    executeResumeStorageJob(
      { ...job, kind: "delete" },
      {
        download: async () => {
          throw new Error();
        },
        upload: async () => {
          assert.fail();
        },
        remove: async () => {
          throw new Error("offline");
        },
      },
      async () => {
        assert.fail();
      },
    ),
    /offline/,
  );
});

test("same-size staging tampering cannot replace verified resume bytes", async () => {
  await assert.rejects(
    executeResumeStorageJob(
      job,
      {
        download: async () => new Blob(["bad"]),
        upload: async () => {
          assert.fail();
        },
        remove: async () => {
          assert.fail();
        },
      },
      async () => {
        assert.fail();
      },
    ),
    /changed after validation/,
  );
});
