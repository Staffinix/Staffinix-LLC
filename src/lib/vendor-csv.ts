import type { CrmStatus, CrmTier } from "./crm-constants.ts";

export type VendorCsvRow = {
  name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  linkedin_id?: string | null;
  contact_role?: string | null;
  website?: string | null;
  status?: CrmStatus;
  tier?: CrmTier | null;
  payment_terms_days?: number | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  tax_id?: string | null;
  msa_signed_at?: string | null;
  notes?: string | null;
};

const COLUMNS = [
  ["Company Name", "name"],
  ["Name", "contact_name"],
  ["Mail", "contact_email"],
  ["Contact Number", "contact_phone"],
  ["LinkedIn ID", "linkedin_id"],
  ["Role", "contact_role"],
  ["Website", "website"],
  ["Status", "status"],
  ["Tier", "tier"],
  ["Payment Terms Days", "payment_terms_days"],
  ["Address", "address"],
  ["City", "city"],
  ["State", "state"],
  ["Country", "country"],
  ["Postal Code", "postal_code"],
  ["Tax ID", "tax_id"],
  ["MSA Signed At", "msa_signed_at"],
  ["Notes", "notes"],
] as const satisfies ReadonlyArray<readonly [string, keyof VendorCsvRow]>;

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const HEADER_ALIASES: Record<string, keyof VendorCsvRow> = Object.fromEntries(
  COLUMNS.map(([label, key]) => [normalizeHeader(label), key]),
) as Record<string, keyof VendorCsvRow>;

Object.assign(HEADER_ALIASES, {
  company: "name",
  vendor: "name",
  vendorname: "name",
  contactname: "contact_name",
  email: "contact_email",
  contactemail: "contact_email",
  phone: "contact_phone",
  contactphone: "contact_phone",
  linkedin: "linkedin_id",
  linkedinurl: "linkedin_id",
  contactrole: "contact_role",
  jobtitle: "contact_role",
});

function parseCells(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (quoted) throw new Error("CSV contains an unclosed quoted value.");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

const nullable = (value: string) => value.trim() || null;

export function parseVendorCsv(csv: string): VendorCsvRow[] {
  const rows = parseCells(csv.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("CSV must contain a header and at least one vendor row.");

  const keys = rows[0].map((header) => HEADER_ALIASES[normalizeHeader(header)] ?? null);
  if (!keys.includes("name")) throw new Error('CSV must include a "Company Name" column.');

  return rows.slice(1).map((cells, rowIndex) => {
    const raw: Partial<Record<keyof VendorCsvRow, string>> = {};
    keys.forEach((key, index) => {
      if (key) raw[key] = cells[index]?.trim() ?? "";
    });

    const name = raw.name?.trim();
    if (!name) throw new Error(`Row ${rowIndex + 2}: Company Name is required.`);
    const status = (raw.status?.toLowerCase() || "active") as CrmStatus;
    if (!["prospect", "active", "inactive"].includes(status)) {
      throw new Error(`Row ${rowIndex + 2}: Status must be prospect, active, or inactive.`);
    }
    const tierText = raw.tier?.toLowerCase() ?? "";
    if (tierText && !["a", "b", "c"].includes(tierText)) {
      throw new Error(`Row ${rowIndex + 2}: Tier must be A, B, or C.`);
    }
    const paymentText = raw.payment_terms_days?.trim() ?? "";
    const paymentTerms = paymentText ? Number(paymentText) : null;
    if (
      paymentTerms !== null &&
      (!Number.isInteger(paymentTerms) || paymentTerms < 0 || paymentTerms > 365)
    ) {
      throw new Error(`Row ${rowIndex + 2}: Payment Terms Days must be an integer from 0 to 365.`);
    }

    return {
      name,
      contact_name: nullable(raw.contact_name ?? ""),
      contact_email: nullable(raw.contact_email ?? ""),
      contact_phone: nullable(raw.contact_phone ?? ""),
      linkedin_id: nullable(raw.linkedin_id ?? ""),
      contact_role: nullable(raw.contact_role ?? ""),
      website: nullable(raw.website ?? ""),
      status,
      tier: (tierText || null) as CrmTier | null,
      payment_terms_days: paymentTerms,
      address: nullable(raw.address ?? ""),
      city: nullable(raw.city ?? ""),
      state: nullable(raw.state ?? ""),
      country: nullable(raw.country ?? ""),
      postal_code: nullable(raw.postal_code ?? ""),
      tax_id: nullable(raw.tax_id ?? ""),
      msa_signed_at: nullable(raw.msa_signed_at ?? ""),
      notes: nullable(raw.notes ?? ""),
    };
  });
}

const escapeCell = (value: unknown) => {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function createVendorCsv(rows: VendorCsvRow[]): string {
  const header = COLUMNS.map(([label]) => escapeCell(label)).join(",");
  const body = rows.map((row) => COLUMNS.map(([, key]) => escapeCell(row[key])).join(","));
  return [header, ...body].join("\r\n");
}
