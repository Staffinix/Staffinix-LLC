import { createServerFn } from "@tanstack/react-start";
import { requirePlacementsAccess } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const STATUSES = ["active", "ended", "terminated", "extended"] as const;
const RATE_TYPES = ["hourly", "annual", "monthly"] as const;

export const listPlacements = createServerFn({ method: "POST" })
  .middleware([requirePlacementsAccess])
  .validator((i: unknown) =>
    z
      .object({
        status: z.array(z.enum(STATUSES)).optional(),
        page: z.number().int().min(1).default(1),
        page_size: z.number().int().min(1).max(100).default(50),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;
    let q = supabase
      .from("placements")
      .select(
        `id, status, start_date, end_date, bill_rate, pay_rate, margin, currency, rate_type, created_at,
         candidate:candidates(id, first_name, last_name, current_title),
         requirement:requirements(id, title),
         client:clients(id, name),
         vendor:vendors(id, name),
         submission_id`,
        { count: "exact" },
      )
      .order("start_date", { ascending: false, nullsFirst: false })
      .range(from, to);
    if (data.status?.length) q = q.in("status", data.status);
    const { data: rows, error, count } = await q;

    if (error) throw new Error(`Unable to load placements: ${error.message}`);
    return { rows: rows ?? [], total: count ?? 0, page: data.page, page_size: data.page_size };
  });

export const updatePlacement = createServerFn({ method: "POST" })
  .middleware([requirePlacementsAccess])
  .validator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        values: z
          .object({
            start_date: z.string().nullable().optional(),
            end_date: z.string().nullable().optional(),
            bill_rate: z.number().nonnegative().nullable().optional(),
            pay_rate: z.number().nonnegative().nullable().optional(),
            currency: z.string().max(8).optional(),
            rate_type: z.enum(RATE_TYPES).nullable().optional(),
            status: z.enum(STATUSES).optional(),
            notes: z.string().max(4000).nullable().optional(),
          })
          .partial(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("placements").update(data.values).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
