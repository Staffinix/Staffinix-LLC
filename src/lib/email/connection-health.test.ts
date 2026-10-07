import assert from "node:assert/strict";
import test from "node:test";

import { getEmailAccountLoadFailure, getProviderUnavailableMessage } from "./connection-health.ts";

test("classifies a missing Smart Email table without leaking database details", () => {
  const result = getEmailAccountLoadFailure({
    code: "PGRST205",
    message: "Could not find public.email_accounts in the schema cache",
  });
  assert.equal(result.code, "database_setup_incomplete");
  assert.match(result.message, /database setup is incomplete/i);
  assert.doesNotMatch(result.message, /public\.email_accounts|schema cache/i);
});

test("uses a recoverable message for other account-list failures", () => {
  assert.equal(getEmailAccountLoadFailure({ code: "08006" }).code, "temporarily_unavailable");
});

test("reports provider-specific configuration states", () => {
  assert.match(
    getProviderUnavailableMessage("gmail", "oauth_configuration_missing") ?? "",
    /Gmail OAuth credentials/i,
  );
  assert.match(
    getProviderUnavailableMessage("microsoft", "redirect_uri_invalid") ?? "",
    /Microsoft Outlook.*callback/i,
  );
  assert.equal(getProviderUnavailableMessage("gmail", "available"), null);
});
