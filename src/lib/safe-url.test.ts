import assert from "node:assert/strict";
import test from "node:test";

import { getSafeHttpUrl, isSafeHttpUrl } from "./safe-url.ts";

test("accepts only absolute HTTP and HTTPS links", () => {
  assert.equal(isSafeHttpUrl("https://meet.example.test/room"), true);
  assert.equal(isSafeHttpUrl("http://127.0.0.1:54321/storage/object"), true);
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("data:text/html,<script>alert(1)</script>"), false);
  assert.equal(isSafeHttpUrl("//attacker.example/path"), false);
  assert.equal(isSafeHttpUrl("not a URL"), false);
});

test("normalizes safe URLs and returns null for unsafe values", () => {
  assert.equal(getSafeHttpUrl("https://example.test/path"), "https://example.test/path");
  assert.equal(getSafeHttpUrl("javascript:alert(1)"), null);
  assert.equal(getSafeHttpUrl(null), null);
});
