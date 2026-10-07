import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { isSafeHttpUrl } from "@/lib/safe-url";

/** Level 1 + Level 2 tenancy context for the signed-in user. */
export const getTenancy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, tenant_id, full_name, email, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(`Failed to load profile: ${profileError.message}`);
    if (!profile?.is_active) throw new Error("Account is inactive or unavailable");

    const [{ data: platform, error: platformError }, { data: roles, error: rolesError }] =
      await Promise.all([
        supabase.from("platform_admins").select("role").eq("user_id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
    if (platformError) throw new Error(`Failed to load platform role: ${platformError.message}`);
    if (rolesError) throw new Error(`Failed to load roles: ${rolesError.message}`);

    let tenant = null;
    if (profile.tenant_id) {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, slug, plan, status, logo_url")
        .eq("id", profile.tenant_id)
        .maybeSingle();
      if (error) throw new Error(`Failed to load tenant: ${error.message}`);
      tenant = data;
    }

    return {
      tenant,
      platformRole: platform?.role ?? null,
      isPlatformStaff: Boolean(platform?.role),
      roles: (roles ?? []).map((role) => role.role),
    };
  });

/* ------------------------- LEVEL 1: PLATFORM ------------------------- */

const PlatformConsoleOverviewSchema = z.object({
  totals: z.object({
    tenants: z.number().int().nonnegative(),
    users: z.number().int().nonnegative(),
    requirements: z.number().int().nonnegative(),
    candidates: z.number().int().nonnegative(),
  }),
  tenants: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
      plan: z.enum(["trial", "starter", "growth", "enterprise"]),
      status: z.enum(["active", "trialing", "suspended", "cancelled"]),
      seat_limit: z.number().int().positive(),
      industry: z.string().nullable(),
      website: z.string().nullable(),
      primary_contact_email: z.string().nullable(),
      tax_id: z.string().nullable(),
      company_address: z.string().nullable(),
      owner_contact_name: z.string().nullable(),
      owner_contact_email: z.string().nullable(),
      owner_contact_phone: z.string().nullable(),
      admin_contact_name: z.string().nullable(),
      admin_contact_email: z.string().nullable(),
      admin_contact_phone: z.string().nullable(),
      created_at: z.string().nullable(),
      stats: z.object({
        users: z.number().int().nonnegative(),
        requirements: z.number().int().nonnegative(),
        candidates: z.number().int().nonnegative(),
      }),
    }),
  ),
});

export const listTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { requirePlatformAdmin } = await import("@/lib/platform-auth.server");
    await requirePlatformAdmin(supabase, userId);

    const { data, error } = await supabase.rpc("platform_console_overview");
    if (error) throw new Error(`Failed to load tenants: ${error.message}`);
    return PlatformConsoleOverviewSchema.parse(data);
  });

const TenantSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .trim()
      .max(80)
      .transform((s) =>
        s
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60),
      )
      .refine((s) => s.length >= 2, "Slug must have at least 2 valid characters"),

    plan: z.enum(["trial", "starter", "growth", "enterprise"]),
    status: z.enum(["active", "trialing", "suspended", "cancelled"]),
    seat_limit: z.number().int().min(1).max(10000),
    industry: z.string().trim().max(80).nullable().optional(),
    website: z
      .string()
      .trim()
      .url()
      .max(200)
      .refine(isSafeHttpUrl, "Website must use HTTP or HTTPS")
      .nullable()
      .optional(),
    primary_contact_email: z.string().trim().email().max(200).nullable().optional(),
    tax_id: z.string().trim().max(80).nullable().optional(),
    company_address: z.string().trim().max(500).nullable().optional(),
    owner_contact_name: z.string().trim().max(120).nullable().optional(),
    owner_contact_email: z.string().trim().email().max(255).nullable().optional(),
    owner_contact_phone: z.string().trim().max(40).nullable().optional(),
    admin_contact_name: z.string().trim().max(120).nullable().optional(),
    admin_contact_email: z.string().trim().email().max(255).nullable().optional(),
    admin_contact_phone: z.string().trim().max(40).nullable().optional(),
  })
  .strict();

const TENANT_REGISTRATION_FIELDS =
  "id, name, slug, plan, status, seat_limit, industry, website, primary_contact_email, tax_id, company_address, owner_contact_name, owner_contact_email, owner_contact_phone, admin_contact_name, admin_contact_email, admin_contact_phone, created_at";

export const createTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => TenantSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { requirePlatformAdmin } = await import("@/lib/platform-auth.server");
    await requirePlatformAdmin(supabase, userId);
    const { data: created, error } = await supabase
      .from("tenants")
      .insert(data)
      .select(TENANT_REGISTRATION_FIELDS)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (created) {
      await supabase.from("workflow_settings").insert({ tenant_id: created.id });
    }

    const { writeAudit } = await import("@/lib/audit.server");
    await writeAudit({
      actorId: userId,
      actorEmail: (claims.email as string | undefined) ?? null,
      action: "tenant.created",
      entityType: "tenant",
      entityId: created?.id ?? null,
      metadata: { name: data.name, plan: data.plan },
    });
    return created;
  });

export const updateTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({ id: z.string().uuid(), patch: TenantSchema.partial() }).strict().parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { requirePlatformAdmin } = await import("@/lib/platform-auth.server");
    await requirePlatformAdmin(supabase, userId);
    const { data: updated, error } = await supabase
      .from("tenants")
      .update(data.patch)
      .eq("id", data.id)
      .select(TENANT_REGISTRATION_FIELDS)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { writeAudit } = await import("@/lib/audit.server");
    await writeAudit({
      actorId: userId,
      actorEmail: (claims.email as string | undefined) ?? null,
      action: "tenant.updated",
      entityType: "tenant",
      entityId: data.id,
      metadata: { fields: Object.keys(data.patch) },
    });
    return updated;
  });

/* ------------------------- LEVEL 2: COMPANY ------------------------- */

export const getCompanyOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { requireAdmin } = await import("@/lib/rbac.server");
    await requireAdmin(supabase, userId);
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.tenant_id ?? null;

    const { data: tenant } = tenantId
      ? await supabase
          .from("tenants")
          .select(
            "id, name, slug, plan, status, seat_limit, industry, website, primary_contact_email",
          )
          .eq("id", tenantId)
          .maybeSingle()
      : { data: null };

    const [members, roles, reqs, subs, places] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, is_active, created_at"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("requirements").select("id, status"),
      supabase.from("submissions").select("id, stage"),
      supabase.from("placements").select("id, status, margin"),
    ]);

    const roleMap = new Map<string, string[]>();
    for (const r of roles.data ?? []) {
      roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
    }

    const byRole: Record<string, number> = {};
    for (const list of roleMap.values()) for (const r of list) byRole[r] = (byRole[r] ?? 0) + 1;

    return {
      tenant,
      members: (members.data ?? []).map((m) => ({ ...m, roles: roleMap.get(m.id) ?? [] })),
      byRole,
      seatsUsed: members.data?.length ?? 0,
      counts: {
        requirements: reqs.data?.length ?? 0,
        openRequirements: (reqs.data ?? []).filter((r) => r.status === "open").length,
        submissions: subs.data?.length ?? 0,
        hires: (subs.data ?? []).filter((s) => s.stage === "hired").length,
        activePlacements: (places.data ?? []).filter((p) => p.status === "active").length,
      },
    };
  });

export const updateMyCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        industry: z.string().trim().max(80).nullable().optional(),
        website: z
          .string()
          .trim()
          .url()
          .max(200)
          .refine(isSafeHttpUrl, "Website must use HTTP or HTTPS")
          .nullable()
          .optional(),
        primary_contact_email: z.string().trim().email().max(200).nullable().optional(),
      })
      .strict()
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { requireAdmin } = await import("@/lib/rbac.server");
    await requireAdmin(supabase, userId);
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.tenant_id) throw new Error("No company found for this user");

    const { data: updated, error } = await supabase
      .from("tenants")
      .update(data)
      .eq("id", profile.tenant_id)
      .select("id, name, industry, website, primary_contact_email")
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { writeAudit } = await import("@/lib/audit.server");
    await writeAudit({
      actorId: userId,
      actorEmail: (claims.email as string | undefined) ?? null,
      action: "company.updated",
      entityType: "tenant",
      entityId: profile.tenant_id,
      metadata: { fields: Object.keys(data) },
    });
    return updated;
  });
