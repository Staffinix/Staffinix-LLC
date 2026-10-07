import { createServerFn } from "@tanstack/react-start";
import { requireClientsAccess } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { isSafeHttpUrl } from "@/lib/safe-url";

const STATUSES = ["prospect", "active", "inactive"] as const;
const TIERS = ["a", "b", "c"] as const;

const CLIENT_LIST_FIELDS =
  "id, name, status, tier, industry, contact_name, contact_email, city, state, country, created_at";
const CLIENT_DETAIL_FIELDS =
  "id, name, status, tier, industry, contact_name, contact_email, contact_phone, website, address, city, state, country, postal_code, tax_id, msa_signed_at, notes";

const ClientInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  status: z.enum(STATUSES).default("active"),
  tier: z.enum(TIERS).nullable().optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  contact_name: z.string().trim().max(120).nullable().optional(),
  contact_email: z
    .string()
    .trim()
    .email()
    .max(255)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  contact_phone: z.string().trim().max(40).nullable().optional(),
  website: z
    .string()
    .trim()
    .max(255)
    .url()
    .refine(isSafeHttpUrl, "Website must use HTTP or HTTPS")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  address: z.string().trim().max(240).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  postal_code: z.string().trim().max(24).nullable().optional(),
  tax_id: z.string().trim().max(60).nullable().optional(),
  msa_signed_at: z.string().trim().max(20).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const ListSchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum([...STATUSES, "all"]).optional(),
  tier: z.enum([...TIERS, "all"]).optional(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(20),
});

export const listClients = createServerFn({ method: "POST" })
  .middleware([requireClientsAccess])
  .validator((input: unknown) => ListSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;
    let q = context.supabase
      .from("clients")
      .select(CLIENT_LIST_FIELDS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (data.search) q = q.ilike("name", `%${data.search}%`);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.tier && data.tier !== "all") q = q.eq("tier", data.tier);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(`Failed to load clients: ${error.message}`);

    return { rows: rows ?? [], total: count ?? 0, page: data.page, page_size: data.page_size };
  });

export const listClientsLite = createServerFn({ method: "GET" })
  .middleware([requireClientsAccess])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clients")
      .select("id, name, status")
      .order("name")
      .limit(200);
    if (error) throw new Error(`Failed to load clients: ${error.message}`);
    return data ?? [];
  });

export const getClient = createServerFn({ method: "POST" })
  .middleware([requireClientsAccess])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: client, error } = await context.supabase
      .from("clients")
      .select(CLIENT_DETAIL_FIELDS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(`Failed to load client: ${error.message}`);
    if (!client) throw new Error("Client not found or access denied");

    const [reqs, subs, plcs] = await Promise.all([
      context.supabase
        .from("requirements")
        .select("id, title, status, priority, created_at")
        .eq("client_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("submissions")
        .select("id, stage, created_at, candidate_id, requirement_id")
        .eq("client_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("placements")
        .select("id, status, start_date, end_date, bill_rate, pay_rate")
        .eq("client_id", data.id)
        .order("start_date", { ascending: false })
        .limit(50),
    ]);

    for (const result of [reqs, subs, plcs]) {
      if (result.error)
        throw new Error(`Failed to load client relationships: ${result.error.message}`);
    }

    return {
      client,
      requirements: reqs.data ?? [],
      submissions: subs.data ?? [],
      placements: plcs.data ?? [],
    };
  });

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireClientsAccess])
  .validator((input: unknown) => ClientInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const payload = { ...data, created_by: context.userId };
    const { data: row, error } = await context.supabase
      .from("clients")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(`Failed to create client: ${error.message}`);
    return row;
  });

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireClientsAccess])
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid(), patch: ClientInputSchema.partial() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("clients")
      .update(data.patch)
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Failed to update client: ${error.message}`);
    if (!row) throw new Error("Client not found or access denied");
    return row;
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireClientsAccess])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("clients")
      .delete()
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Failed to delete client: ${error.message}`);
    if (!row) throw new Error("Client not found or access denied");
    return { ok: true };
  });
