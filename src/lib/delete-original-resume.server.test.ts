import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteOriginalResume } from "./delete-original-resume.server.ts";

const tenant = "11111111-1111-4111-8111-111111111111";
const candidate = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
const row = {
  id,
  tenant_id: tenant,
  candidate_id: candidate,
  mime_type: "application/pdf",
  file_path: `${tenant}/${candidate}/${id}.pdf`,
};
const input = { candidate_id: candidate, resume_id: id };
function client(data: unknown, error: unknown = null) {
  const filters: unknown[] = [];
  const query = {
    delete() {
      return this;
    },
    eq(...args: unknown[]) {
      filters.push(args);
      return this;
    },
    select() {
      return this;
    },
    async maybeSingle() {
      return { data, error };
    },
  };
  return {
    db: {
      from: (table: string) => {
        assert.equal(table, "resumes");
        return query;
      },
    } as unknown as Parameters<typeof deleteOriginalResume>[0],
    filters,
  };
}

test("authorized deletion cleans only the returned canonical object", async () => {
  const { db, filters } = client(row);
  const paths: string[] = [];
  assert.deepEqual(
    await deleteOriginalResume(db, input, async (path) => {
      paths.push(path);
    }),
    { cleanupPending: false },
  );
  assert.deepEqual(paths, [row.file_path]);
  assert.deepEqual(filters, [
    ["id", id],
    ["candidate_id", candidate],
    ["is_primary", true],
  ]);
});
for (const [name, data, error] of [
  ["denied or missing", null, null],
  ["RLS error", null, { code: "42501", message: "denied" }],
  ["tailored history reference", null, { code: "23503", message: "foreign key" }],
] as const) {
  test(`${name} never invokes storage cleanup`, async () => {
    const { db } = client(data, error);
    let called = false;
    await assert.rejects(
      deleteOriginalResume(db, input, async () => {
        called = true;
      }),
    );
    assert.equal(called, false);
  });
}
test("noncanonical path cannot be passed to service cleanup", async () => {
  const { db } = client({ ...row, file_path: `another-tenant/file.pdf` });
  let called = false;
  assert.deepEqual(
    await deleteOriginalResume(db, input, async () => {
      called = true;
    }),
    { cleanupPending: true },
  );
  assert.equal(called, false);
});
test("storage failure is reported without claiming file removal", async () => {
  const { db } = client(row);
  assert.deepEqual(
    await deleteOriginalResume(db, input, async () => {
      throw new Error("offline");
    }),
    { cleanupPending: true },
  );
});
