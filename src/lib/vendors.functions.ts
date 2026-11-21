import { createServerFn } from "@tanstack/react-start";
import { requireVendorsAccess } from "@/integrations/supabase/auth-middleware";
import { readOnlyServerFn } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { importVendorRows } from "@/lib/vendor-import";
import {
  VENDOR_STATUSES as STATUSES,
  VENDOR_TIERS as TIERS,
  VendorInputSchema,
} from "@/lib/vendor-schema";

const VENDOR_LIST_FIELDS =
  "id, name, status, tier, contact_name, contact_email, contact_phone, linkedin_id, contact_role, city, state, country, payment_terms_days, created_at";
const VENDOR_DETAIL_FIELDS =
  "id, name, status, tier, contact_name, contact_email, contact_phone, linkedin_id, contact_role, website, address, city, state, country, postal_code, tax_id, payment_terms_days, msa_signed_at, notes";
const VENDOR_EXPORT_FIELDS =
  "name, contact_name, contact_email, contact_phone, linkedin_id, contact_role, website, status, tier, payment_terms_days, address, city, state, country, postal_code, tax_id, msa_signed_at, notes";

const ListSchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum([...STATUSES, "all"]).optional(),
  tier: z.enum([...TIERS, "all"]).optional(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(20),
});

export const listVendors = createServerFn({ method: "POST" })
  .middleware([requireVendorsAccess, readOnlyServerFn])
  .validator((input: unknown) => ListSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;
    let q = context.supabase
      .from("vendors")
      .select(VENDOR_LIST_FIELDS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (data.search) {
      const search = data.search.replace(/[,()%]/g, " ").trim();
      if (search) {
        q = q.or(
          [
            "name",
            "contact_name",
            "contact_email",
            "contact_phone",
            "contact_role",
            "linkedin_id",
            "city",
            "state",
            "country",
          ]
            .map((field) => `${field}.ilike.%${search}%`)
            .join(","),
        );
      }
    }
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.tier && data.tier !== "all") q = q.eq("tier", data.tier);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(`Failed to load vendors: ${error.message}`);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const exportVendors = createServerFn({ method: "POST" })
  .middleware([requireVendorsAccess, readOnlyServerFn])
  .validator((input: unknown) =>
    z
      .object({ cursor: z.string().uuid().optional(), asOf: z.string().datetime().optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const asOf = data.asOf ?? new Date().toISOString();
    let query = context.supabase
      .from("vendors")
      .select(`id, ${VENDOR_EXPORT_FIELDS}`)
      .lte("created_at", asOf)
      .order("id")
      .limit(500);
    if (data.cursor) query = query.gt("id", data.cursor);
    const { data: rows, error } = await query;
    if (error) throw new Error(`Failed to export vendors: ${error.message}`);
    return {
      rows: rows ?? [],
      asOf,
      nextCursor: rows?.length === 500 ? rows[rows.length - 1].id : null,
    };
  });

export const importVendors = createServerFn({ method: "POST" })
  .middleware([requireVendorsAccess])
  .validator((input: unknown) =>
    z.object({ rows: z.array(VendorInputSchema).min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = data.rows.map((row) => ({ ...row, created_by: context.userId }));
    const contactlessNames = payload
      .filter((row) => !row.contact_email && !row.contact_phone)
      .map((row) => row.name);
    let existingNames = new Set<string>();
    if (contactlessNames.length) {
      const { data: existing, error } = await context.supabase
        .from("vendors")
        .select("name")
        .in("name", contactlessNames)
        .limit(1000);
      if (error) throw new Error(`Failed to check existing vendors: ${error.message}`);
      existingNames = new Set((existing ?? []).map((row) => row.name));
    }
    return importVendorRows(payload, existingNames, async (rows) => {
      const { error } = await context.supabase.from("vendors").insert(rows);
      return error;
    });
  });

export const getVendor = createServerFn({ method: "POST" })
  .middleware([requireVendorsAccess, readOnlyServerFn])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: vendor, error } = await context.supabase
      .from("vendors")
      .select(VENDOR_DETAIL_FIELDS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(`Failed to load vendor: ${error.message}`);
    if (!vendor) throw new Error("Vendor not found or access denied");

    const [reqs, subs] = await Promise.all([
      context.supabase
        .from("requirements")
        .select("id, title, status, created_at")
        .eq("vendor_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("submissions")
        .select("id, stage, created_at, candidate_id, requirement_id")
        .eq("vendor_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (reqs.error) throw new Error(`Failed to load vendor requirements: ${reqs.error.message}`);
    if (subs.error) throw new Error(`Failed to load vendor submissions: ${subs.error.message}`);

    return { vendor, requirements: reqs.data ?? [], submissions: subs.data ?? [] };
  });

export const createVendor = createServerFn({ method: "POST" })
  .middleware([requireVendorsAccess])
  .validator((input: unknown) => VendorInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const payload = { ...data, created_by: context.userId };
    const { data: row, error } = await context.supabase
      .from("vendors")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(`Failed to create vendor: ${error.message}`);
    return row;
  });

export const updateVendor = createServerFn({ method: "POST" })
  .middleware([requireVendorsAccess])
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid(), patch: VendorInputSchema.partial() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("vendors")
      .update(data.patch)
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Failed to update vendor: ${error.message}`);
    if (!row) throw new Error("Vendor not found or access denied");
    return row;
  });

export const deleteVendor = createServerFn({ method: "POST" })
  .middleware([requireVendorsAccess])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("vendors")
      .delete()
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Failed to delete vendor: ${error.message}`);
    if (!row) throw new Error("Vendor not found or access denied");
    return { ok: true };
  });
