import { createServerFn } from "@tanstack/react-start";
import { requireInterviewsAccess } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { isSafeHttpUrl } from "@/lib/safe-url";

const ROUNDS = ["screen", "l1", "l2", "manager", "client", "technical", "final", "other"] as const;
const OUTCOMES = [
  "scheduled",
  "completed",
  "passed",
  "failed",
  "no_show",
  "rescheduled",
  "cancelled",
] as const;

const InterviewInputSchema = z.object({
  submission_id: z.string().uuid(),
  round: z.enum(ROUNDS).default("l1"),
  scheduled_at: z.string().nullable().optional(),
  duration_minutes: z.number().int().min(5).max(600).default(45),
  timezone: z.string().max(60).default("America/New_York"),
  meeting_link: z
    .string()
    .trim()
    .max(600)
    .url()
    .refine(isSafeHttpUrl, "Meeting link must use HTTP or HTTPS")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  location: z.string().max(200).nullable().optional(),
  interviewer_name: z.string().max(160).nullable().optional(),
  interviewer_email: z.string().max(255).nullable().optional(),
  outcome: z.enum(OUTCOMES).default("scheduled"),
  score: z.number().int().min(0).max(10).nullable().optional(),
  feedback: z.string().max(8000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

// list — optional filter by submission_id or upcoming
export const listInterviews = createServerFn({ method: "POST" })
  .middleware([requireInterviewsAccess])
  .validator((i: unknown) =>
    z
      .object({
        submission_id: z.string().uuid().optional(),
        upcoming_only: z.boolean().default(false),
        outcome: z.array(z.enum(OUTCOMES)).optional(),
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
      .from("interviews")
      .select(
        `id, round, scheduled_at, duration_minutes, timezone, meeting_link, interviewer_name, outcome, score, created_at, submission_id,
         submission:submissions(id, stage,
           requirement:requirements(id, title),
           candidate:candidates(id, first_name, last_name)
         )`,
        { count: "exact" },
      )
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .range(from, to);
    if (data.submission_id) q = q.eq("submission_id", data.submission_id);
    if (data.outcome?.length) q = q.in("outcome", data.outcome);
    if (data.upcoming_only) {
      q = q.gte("scheduled_at", new Date().toISOString()).eq("outcome", "scheduled");
    }
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, page: data.page, page_size: data.page_size };
  });

export const scheduleInterview = createServerFn({ method: "POST" })
  .middleware([requireInterviewsAccess])
  .validator((i: unknown) => InterviewInputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { data: row, error } = await supabase
      .from("interviews")
      .insert({ ...data, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Move submission to 'interview' stage if not already past
    const { data: sub } = await supabase
      .from("submissions")
      .select("stage")
      .eq("id", data.submission_id)
      .maybeSingle();
    if (sub && ["submitted", "vendor_review", "client_review"].includes(sub.stage)) {
      await supabase
        .from("submissions")
        .update({ stage: "interview" })
        .eq("id", data.submission_id);
    }

    await supabase.from("submission_events").insert({
      submission_id: data.submission_id,
      event_type: "interview_scheduled",
      actor_id: userId,
      actor_email: (claims as { email?: string })?.email ?? null,
      message: `${data.round.toUpperCase()} scheduled${data.scheduled_at ? ` for ${data.scheduled_at}` : ""}`,
      metadata: { interview_id: row.id, round: data.round },
    });

    return { id: row.id };
  });

export const updateInterview = createServerFn({ method: "POST" })
  .middleware([requireInterviewsAccess])
  .validator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        values: InterviewInputSchema.partial().omit({ submission_id: true }),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { data: current, error: gErr } = await supabase
      .from("interviews")
      .select("submission_id, outcome, round")
      .eq("id", data.id)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!current) throw new Error("Interview not found");

    const { error } = await supabase.from("interviews").update(data.values).eq("id", data.id);
    if (error) throw new Error(error.message);

    if (data.values.outcome && data.values.outcome !== current.outcome) {
      await supabase.from("submission_events").insert({
        submission_id: current.submission_id,
        event_type: "interview_updated",
        actor_id: userId,
        actor_email: (claims as { email?: string })?.email ?? null,
        message: `${current.round.toUpperCase()} outcome: ${data.values.outcome}`,
        metadata: { interview_id: data.id, outcome: data.values.outcome },
      });
    }
    return { ok: true };
  });

export const deleteInterview = createServerFn({ method: "POST" })
  .middleware([requireInterviewsAccess])
  .validator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("interviews").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
