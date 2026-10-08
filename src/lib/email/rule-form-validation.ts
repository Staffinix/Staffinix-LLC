const RULE_NAME_MESSAGE = "Enter a rule name with at least 2 characters.";

export function validateRuleName(name: string): { name: string; error: string | null } {
  const normalizedName = name.trim();

  return {
    name: normalizedName,
    error: normalizedName.length >= 2 ? null : RULE_NAME_MESSAGE,
  };
}

export function getRuleFormErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message.trim()) return fallback;

  try {
    const issues = JSON.parse(error.message) as unknown;
    if (Array.isArray(issues)) {
      const hasNameIssue = issues.some(
        (issue) =>
          typeof issue === "object" &&
          issue !== null &&
          Array.isArray((issue as { path?: unknown }).path) &&
          (issue as { path: unknown[] }).path[0] === "name",
      );

      return hasNameIssue ? RULE_NAME_MESSAGE : "Check the rule details and try again.";
    }
  } catch {
    // Non-validation errors are already written for the user by the server.
  }

  return error.message;
}

