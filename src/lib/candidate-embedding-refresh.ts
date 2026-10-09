type LogFailure = (message: string) => void;

/**
 * Candidate data is the source of truth. Embedding refresh is derived work and
 * must never make an otherwise successful candidate update look unsuccessful.
 */
export async function refreshCandidateEmbeddingBestEffort(
  refresh: () => Promise<void>,
  logFailure: LogFailure = console.error,
) {
  try {
    await refresh();
  } catch {
    // Avoid logging provider errors because they can include sensitive request
    // metadata. Operators still get a stable diagnostic message.
    logFailure("[candidate-embedding] refresh failed");
  }
}
