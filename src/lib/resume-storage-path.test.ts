import assert from "node:assert/strict";
import test from "node:test";

import { isCanonicalResumePathFor } from "./resume-storage-path.ts";

const tenantId = "10000000-0000-4000-8000-000000000001";
const candidateId = "20000000-0000-4000-8000-000000000002";
const objectId = "30000000-0000-4000-8000-000000000003";

test("accepts the exact server canonical PDF path", () => {
  assert.equal(
    isCanonicalResumePathFor({
      path: `${tenantId}/${candidateId}/${objectId}.pdf`,
      tenantId,
      candidateId,
      mimeType: "application/pdf",
    }),
    true,
  );
});

test("rejects another candidate, another extension, and path traversal", () => {
  const paths = [
    `${tenantId}/40000000-0000-4000-8000-000000000004/${objectId}.pdf`,
    `${tenantId}/${candidateId}/${objectId}.docx`,
    `${tenantId}/${candidateId}/../${objectId}.pdf`,
    `/${tenantId}/${candidateId}/${objectId}.pdf`,
  ];

  for (const path of paths) {
    assert.equal(
      isCanonicalResumePathFor({ path, tenantId, candidateId, mimeType: "application/pdf" }),
      false,
      path,
    );
  }
});
