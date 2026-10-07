import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDashboardAccess } from "@/integrations/supabase/auth-middleware";
import { resolveProfileAvatarUrls } from "@/lib/profile-avatar.server";

const CountSchema = z.number().int().nonnegative();
const NamedCountSchema = z
  .object({ name: z.string().trim().min(1).max(160), value: CountSchema })
  .strict();

const DashboardOverviewSchema = z.object({
  kpis: z
    .object({
      teamMembers: CountSchema,
      openRequirements: CountSchema,
      submissionsThisWeek: CountSchema,
      submissionsPrevWeek: CountSchema,
      interviewsScheduled: CountSchema,
      activeConsultants: CountSchema,
      benchReady: CountSchema,
      activePlacements: CountSchema,
      hiresThisMonth: CountSchema,
    })
    .strict(),
  trend: z
    .array(
      z.object({
        date: z.string(),
        label: z.string().trim().min(1).max(32),
        submissions: CountSchema,
        hired: CountSchema,
      }),
    )
    .max(30)
    .default([]),
  funnel: z
    .array(
      z.object({
        stage: z.string(),
        count: CountSchema,
      }),
    )
    .max(20)
    .default([]),
  recruiters: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1).max(255),
        email: z.string().max(255).optional(),
        avatar_url: z.string().max(2_000).nullable().optional(),
        submissions: CountSchema,
        hires: CountSchema,
      }),
    )
    .max(5)
    .default([]),
  bench: z
    .object({
      total: CountSchema,
      immediate: CountSchema,
      by_availability: z
        .array(
          z.object({
            name: z.string(),
            value: CountSchema,
          }),
        )
        .max(10)
        .default([]),
      by_visa: z.array(NamedCountSchema).max(100).default([]),
      top_tech: z.array(NamedCountSchema).max(8).default([]),
    })
    .default({
      total: 0,
      immediate: 0,
      by_availability: [],
      by_visa: [],
      top_tech: [],
    }),
  requirements: z
    .object({
      by_status: z
        .array(
          z.object({
            name: z.string(),
            value: CountSchema,
          }),
        )
        .max(10)
        .default([]),
      by_priority: z
        .array(
          z.object({
            name: z.string(),
            value: CountSchema,
          }),
        )
        .max(10)
        .default([]),
    })
    .default({
      by_status: [],
      by_priority: [],
    }),
});

export type DashboardOverview = z.infer<typeof DashboardOverviewSchema>;

const CandidateAssignmentKpisSchema = z
  .object({
    assigned: CountSchema,
    submitted: CountSchema,
    pending: CountSchema,
  })
  .strict();

/**
 * All dashboard aggregates are computed by PostgreSQL and returned by one
 * tenant-scoped RPC. No business rows are transferred to Node for counting.
 */
export const getDashboardOverview = createServerFn({ method: "GET" })
  .middleware([requireDashboardAccess])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("dashboard_overview");
    if (error) throw new Error(`Unable to load dashboard overview: ${error.message}`);
    if (!data) throw new Error("Dashboard overview is unavailable for this user");
    const overview = DashboardOverviewSchema.parse(data);
    return {
      ...overview,
      recruiters: await resolveProfileAvatarUrls(context.supabase, overview.recruiters),
    };
  });

export const getCandidateAssignmentKpis = createServerFn({ method: "GET" })
  .middleware([requireDashboardAccess])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("candidate_assignment_kpis");
    if (error) throw new Error("Unable to load assigned-candidate metrics.");
    return CandidateAssignmentKpisSchema.parse(data);
  });

export const getRecentActivity = createServerFn({ method: "GET" })
  .middleware([requireDashboardAccess])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("audit_logs")
      .select("id, action, entity_type, entity_id, actor_email, created_at, metadata")
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) throw new Error(`Unable to load recent activity: ${error.message}`);
    return data ?? [];
  });
