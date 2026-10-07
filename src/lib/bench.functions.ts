import { createServerFn } from "@tanstack/react-start";
import { requireCandidatesAccess } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Aggregates the pipeline artefacts + availability history for a bench consultant.
export const getBenchConsultantActivity = createServerFn({ method: "POST" })
  .middleware([requireCandidatesAccess])
  .validator((i: unknown) => z.object({ candidate_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [subsRes, historyRes] = await Promise.all([
      supabase
        .from("submissions")
        .select(
          `id, stage, submitted_rate, rate_type, currency, match_score, created_at, updated_at, submitted_at,
           requirement:requirements(id, title, primary_technology, location),
           client:clients(id, name),
           vendor:vendors(id, name)`,
        )
        .eq("candidate_id", data.candidate_id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("audit_logs")
        .select("id, action, actor_email, metadata, created_at")
        .eq("entity_type", "candidate")
        .eq("entity_id", data.candidate_id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (subsRes.error) throw new Error(subsRes.error.message);

    const submissionIds = (subsRes.data ?? []).map((s) => s.id);
    const interviewsRes = submissionIds.length
      ? await supabase
          .from("interviews")
          .select(
            `id, submission_id, round, scheduled_at, duration_minutes, timezone,
             meeting_link, interviewer_name, outcome, score, feedback, created_at`,
          )
          .in("submission_id", submissionIds)
          .order("scheduled_at", { ascending: false, nullsFirst: false })
      : { data: [] as unknown[], error: null };

    if ("error" in interviewsRes && interviewsRes.error) {
      throw new Error(interviewsRes.error.message);
    }

    return {
      submissions: subsRes.data ?? [],
      interviews: (interviewsRes.data ?? []) as Array<{
        id: string;
        submission_id: string;
        round: string;
        scheduled_at: string | null;
        duration_minutes: number | null;
        timezone: string | null;
        meeting_link: string | null;
        interviewer_name: string | null;
        outcome: string;
        score: number | null;
        feedback: string | null;
        created_at: string;
      }>,
      history: (historyRes.data ?? []).map((h) => ({
        id: h.id as string,
        action: h.action as string,
        actor_email: (h.actor_email ?? null) as string | null,
        metadata_summary: summarizeMetadata(h.metadata),
        created_at: h.created_at as string,
      })),
    };
  });

function summarizeMetadata(m: unknown): string {
  if (!m || typeof m !== "object") return "";
  return Object.entries(m as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");
}
