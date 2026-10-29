export async function collectVendorExport<T>(
  fetchPage: (input: {
    cursor?: string;
    asOf?: string;
  }) => Promise<{ rows: T[]; nextCursor: string | null; asOf: string }>,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | undefined;
  let asOf: string | undefined;
  const cursors = new Set<string>();
  for (let page = 0; page < 1000; page++) {
    const result = await fetchPage({ cursor, asOf });
    rows.push(...result.rows);
    asOf ??= result.asOf;
    if (!result.nextCursor) return rows;
    if (cursors.has(result.nextCursor))
      throw new Error("Export pagination did not advance. No partial file was downloaded.");
    cursors.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  throw new Error("Export exceeds 500,000 vendors. No partial file was downloaded.");
}
