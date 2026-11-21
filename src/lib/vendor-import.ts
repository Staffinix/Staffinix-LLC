type ImportableVendor = {
  name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
};

type InsertError = { code?: string } | null;

export type VendorImportResult = {
  imported: number;
  skipped: number;
  failed: number[];
};

const MAX_ROWS_PER_REQUEST = 100;
// Server functions accept 1 MiB; this leaves room for the request envelope.
const MAX_JSON_BYTES_PER_REQUEST = 400_000;
const SINGLE_INSERT_CONCURRENCY = 8;
const UNIQUE_VIOLATION = "23505";

export function chunkVendorRows<T>(rows: T[]): { start: number; rows: T[] }[] {
  const chunks: { start: number; rows: T[] }[] = [];
  const encoder = new TextEncoder();
  let current: T[] = [];
  let start = 0;
  let bytes = 0;

  rows.forEach((row, index) => {
    const size = encoder.encode(JSON.stringify(row)).length;
    if (
      current.length &&
      (current.length >= MAX_ROWS_PER_REQUEST || bytes + size > MAX_JSON_BYTES_PER_REQUEST)
    ) {
      chunks.push({ start, rows: current });
      current = [];
      start = index;
      bytes = 0;
    }
    current.push(row);
    bytes += size;
  });
  if (current.length) chunks.push({ start, rows: current });
  return chunks;
}

/**
 * Adds new vendors and never overwrites existing ones. The database owns contact
 * uniqueness, so a batch it rejects is retried row by row to keep the new rows.
 */
export async function importVendorRows<T extends ImportableVendor>(
  rows: T[],
  existingNames: ReadonlySet<string>,
  insert: (rows: T[]) => Promise<InsertError>,
): Promise<VendorImportResult> {
  // Rows without an email or phone have no database duplicate check.
  const names = new Set([...existingNames].map((name) => name.toLowerCase()));
  const pending: { index: number; row: T }[] = [];
  let skipped = 0;
  rows.forEach((row, index) => {
    if (!row.contact_email && !row.contact_phone) {
      const name = row.name.trim().toLowerCase();
      if (names.has(name)) {
        skipped += 1;
        return;
      }
      names.add(name);
    }
    pending.push({ index, row });
  });

  if (!pending.length) return { imported: 0, skipped, failed: [] };
  if (!(await insert(pending.map(({ row }) => row)))) {
    return { imported: pending.length, skipped, failed: [] };
  }

  let imported = 0;
  const failed: number[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(SINGLE_INSERT_CONCURRENCY, pending.length) }, async () => {
      while (next < pending.length) {
        const { index, row } = pending[next++];
        const error = await insert([row]);
        if (!error) imported += 1;
        else if (error.code === UNIQUE_VIOLATION) skipped += 1;
        else failed.push(index);
      }
    }),
  );
  return { imported, skipped, failed: failed.sort((a, b) => a - b) };
}
