export function getCandidateSubmissionAttribution(candidate: {
  last_submitted_at: string | null;
  last_submitted_by: string | null;
  submissions: Array<{
    stage: string;
    submitted_at: string | null;
    submitted_by: string | null;
    created_by: string | null;
  }>;
}) {
  const latest = candidate.submissions[0];
  if (candidate.last_submitted_at || latest?.submitted_at) {
    return {
      kind: "submitted" as const,
      userId: candidate.last_submitted_at
        ? candidate.last_submitted_by
        : (latest?.submitted_by ?? null),
    };
  }
  if (latest?.stage === "draft") {
    return { kind: "draft" as const, userId: latest.created_by };
  }
  return { kind: "none" as const, userId: null };
}
