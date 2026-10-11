import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchProviderMessages,
  getProviderConfigurationStatus,
  normalizeGmailMessage,
  normalizeMicrosoftMessage,
} from "./providers.server.ts";

test("Gmail returns a continuation token and resumes beyond the page limit", async () => {
  const originalFetch = globalThis.fetch;
  const seenTokens: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const token = url.searchParams.get("pageToken") ?? "page-1";
    seenTokens.push(token);
    const page = Number(token.split("-")[1]);
    return Response.json({
      messages: [],
      ...(page < 3 ? { nextPageToken: `page-${page + 1}` } : {}),
    });
  };
  try {
    const batch = await fetchProviderMessages(
      "gmail",
      "account",
      "test-only",
      "2026-01-01T00:00:00Z",
    );
    assert.equal(batch.nextCursor, "page-3");
    const finalBatch = await fetchProviderMessages(
      "gmail",
      "account",
      "test-only",
      "2026-01-01T00:00:00Z",
      batch.nextCursor,
    );
    assert.equal(finalBatch.nextCursor, null);
    assert.deepEqual(seenTokens, ["page-1", "page-2", "page-3"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Outlook returns continuation and rejects untrusted resume URLs before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const nextLink = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skip=100";
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ value: [], "@odata.nextLink": nextLink });
  };
  try {
    const batch = await fetchProviderMessages("microsoft", "account", "test-only");
    assert.equal(batch.nextCursor, nextLink);
    assert.equal(calls, 2);
    await assert.rejects(
      fetchProviderMessages(
        "microsoft",
        "account",
        "test-only",
        null,
        "https://attacker.example/v1.0/me/messages",
      ),
      /invalid pagination URL/,
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports provider OAuth readiness without exposing credential values", () => {
  assert.deepEqual(getProviderConfigurationStatus("gmail", {}), {
    configured: false,
    reason: "oauth_configuration_missing",
  });
  assert.deepEqual(
    getProviderConfigurationStatus("gmail", {
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_EMAIL_REDIRECT_URI:
        "https://my-version-kappa.vercel.app/settings/email-accounts/callback?provider=gmail",
    }),
    { configured: true, reason: "available" },
  );
  assert.deepEqual(
    getProviderConfigurationStatus("microsoft", {
      MICROSOFT_CLIENT_ID: "client-id",
      MICROSOFT_CLIENT_SECRET: "client-secret",
      MICROSOFT_EMAIL_REDIRECT_URI:
        "https://my-version-kappa.vercel.app/settings/email-accounts/callback?provider=gmail",
    }),
    { configured: false, reason: "redirect_uri_invalid" },
  );
});

test("normalizes Gmail messages and attachment metadata", () => {
  const normalized = normalizeGmailMessage(
    {
      id: "g1",
      threadId: "t1",
      internalDate: "1790755200000",
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          { name: "From", value: "Jobs <jobs@example.com>" },
          { name: "To", value: "Recruiter <r@staffinix.com>" },
          { name: "Subject", value: "Candidate" },
        ],
        parts: [
          { mimeType: "text/plain", body: { data: "UmVzdW1lIGF0dGFjaGVk" } },
          {
            mimeType: "application/pdf",
            filename: "resume.pdf",
            body: { attachmentId: "a1", size: 42 },
          },
        ],
      },
    },
    "account",
  );
  assert.equal(normalized.from.email, "jobs@example.com");
  assert.equal(normalized.textBody, "Resume attached");
  assert.equal(normalized.attachments[0].filename, "resume.pdf");
});

test("normalizes Microsoft Graph messages", () => {
  const normalized = normalizeMicrosoftMessage(
    {
      id: "m1",
      conversationId: "c1",
      subject: "Application",
      receivedDateTime: "2026-09-30T08:00:00Z",
      hasAttachments: false,
      from: { emailAddress: { name: "Applicant", address: "Person@Example.com" } },
      toRecipients: [],
      ccRecipients: [],
      body: { contentType: "text", content: "Candidate profile" },
      attachments: [],
    },
    "account",
  );
  assert.equal(normalized.from.email, "person@example.com");
  assert.equal(normalized.textBody, "Candidate profile");
});
