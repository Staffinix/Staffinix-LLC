import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSubmissionsAccess } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import { writeAudit } from "./audit.server";

const STAGES = [
  "draft",
  "submitted",
  "vendor_review",
  "client_review",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;
const RATE_TYPES = ["hourly", "annual", "monthly"] as const;

async function requireApprovedResumeVersion(
  supabase: SupabaseClient<Database>,
  versionId: string,
  candidateId: string,
  requirementId: string,
) {
  const { data: version, error } = await supabase
    .from("resume_versions")
    .select(
      "id, candidate_id, requirement_id, version_no, status, source_hash, source_facts, claim_validation",
    )
    .eq("id", versionId)
    .eq("candidate_id", candidateId)
    .eq("requirement_id", requirementId)
    .maybeSingle();
  if (error) throw new Error(`Unable to validate tailored resume: ${error.message}`);
  if (!version || version.status !== "approved") {
    throw new Error("An approved tailored resume for this candidate and requirement is required");
  }
  const validation = version.claim_validation as { valid?: boolean } | null;
  if (validation?.valid !== true || !version.source_hash) {
    throw new Error("The selected resume version does not have valid source evidence");
  }
  return version;
}

const SubmissionInputSchema = z.object({
  requirement_id: z.string().uuid(),
  candidate_id: z.string().uuid(),
  resume_version_id: z.string().uuid().nullable().optional(),
  submitted_rate: z.number().nonnegative().nullable().optional(),
  rate_type: z.enum(RATE_TYPES).nullable().optional(),
  currency: z.string().max(8).default("USD"),
  vendor_id: z.string().uuid().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  email_subject: z.string().max(300).nullable().optional(),
  email_body: z.string().max(20000).nullable().optional(),
  email_to: z.string().max(500).nullable().optional(),
  email_cc: z.string().max(500).nullable().optional(),
  match_score: z.number().nullable().optional(),
  match_strengths: z.array(z.string()).max(20).optional(),
  match_gaps: z.array(z.string()).max(20).optional(),
  notes: z.string().max(8000).nullable().optional(),
  stage: z.enum(STAGES).default("draft"),
});

// ------- list -------
const ListInputSchema = z.object({
  search: z.string().trim().max(120).optional(),
  stage: z.array(z.enum(STAGES)).optional(),
  requirement_id: z.string().uuid().optional(),
  candidate_id: z.string().uuid().optional(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(20),
});

export const listSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSubmissionsAccess])
  .validator((input: unknown) => ListInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;

    let q = supabase
      .from("submissions")
      .select(
        `id, stage, submitted_rate, rate_type, currency, match_score, created_at, updated_at, submitted_at, created_by, submitted_by,
         requirement:requirements(id, title, primary_technology, location),
         candidate:candidates(id, first_name, last_name, current_title, visa_status),
         client:clients(id, name),
         vendor:vendors(id, name)`,
        { count: "exact" },
      )
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (data.stage?.length) q = q.in("stage", data.stage);
    if (data.requirement_id) q = q.eq("requirement_id", data.requirement_id);
    if (data.candidate_id) q = q.eq("candidate_id", data.candidate_id);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    const actorIds = [
      ...new Set(
        (rows ?? [])
          .flatMap((row) => [row.created_by, row.submitted_by])
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const { data: profiles, error: profilesError } = actorIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
      : { data: [], error: null };
    if (profilesError)
      throw new Error(`Unable to load submission actors: ${profilesError.message}`);
    const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

    return {
      rows: (rows ?? []).map((row) => ({
        ...row,
        creator: row.created_by ? (profileMap.get(row.created_by) ?? null) : null,
        submitter: row.submitted_by ? (profileMap.get(row.submitted_by) ?? null) : null,
      })),
      total: count ?? 0,
      page: data.page,
      page_size: data.page_size,
    };
  });

// ------- get -------
export const getSubmission = createServerFn({ method: "POST" })
  .middleware([requireSubmissionsAccess])
  .validator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: sub, error } = await supabase
      .from("submissions")
      .select(
        `id, requirement_id, candidate_id, resume_version_id, stage, submitted_rate, rate_type, currency, vendor_id, client_id, email_subject, email_body, email_to, email_cc, email_sent_at, match_score, match_strengths, match_gaps, notes, submitted_by, submitted_at, rejected_reason, created_by, created_at, updated_at,
         requirement:requirements(id, title, primary_technology, location, work_mode, rate_min, rate_max, rate_type, currency, visa_types, min_experience_years, max_experience_years),
         candidate:candidates(id, first_name, last_name, email, phone, current_title, current_employer, visa_status, location, experience_years, primary_technology),
         client:clients(id, name),
         vendor:vendors(id, name),
         resume_version:resume_versions(id, version_no, file_path, created_at)`,
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sub) throw new Error("Submission not found");

    const [eventsResult, interviewsResult, placementResult] = await Promise.all([
      supabase
        .from("submission_events")
        .select(
          "id, submission_id, event_type, from_stage, to_stage, message, metadata, actor_id, actor_email, created_at",
        )
        .eq("submission_id", data.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("interviews")
        .select(
          "id, submission_id, round, scheduled_at, duration_minutes, timezone, meeting_link, location, interviewer_name, interviewer_email, outcome, score, feedback, ai_summary, notes, created_at, updated_at",
        )
        .eq("submission_id", data.id)
        .order("scheduled_at", { ascending: false }),
      supabase
        .from("placements")
        .select(
          "id, submission_id, candidate_id, requirement_id, client_id, vendor_id, start_date, end_date, bill_rate, pay_rate, currency, rate_type, margin, status, notes, created_at, updated_at",
        )
        .eq("submission_id", data.id)
        .maybeSingle(),
    ]);
    if (eventsResult.error)
      throw new Error(`Unable to load submission events: ${eventsResult.error.message}`);
    if (interviewsResult.error)
      throw new Error(`Unable to load submission interviews: ${interviewsResult.error.message}`);
    if (placementResult.error)
      throw new Error(`Unable to load submission placement: ${placementResult.error.message}`);

    return {
      submission: sub,
      events: eventsResult.data ?? [],
      interviews: interviewsResult.data ?? [],
      placement: placementResult.data ?? null,
    };
  });

// ------- create -------
export const createSubmission = createServerFn({ method: "POST" })
  .middleware([requireSubmissionsAccess])
  .validator((i: unknown) => SubmissionInputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    const stage = data.stage;
    if (stage !== "draft" && !data.resume_version_id) {
      throw new Error("Approve a fact-validated tailored resume before submitting");
    }
    if (data.resume_version_id) {
      await requireApprovedResumeVersion(
        supabase,
        data.resume_version_id,
        data.candidate_id,
        data.requirement_id,
      );
    }
    const submitted_at = stage !== "draft" ? new Date().toISOString() : null;

    const { data: row, error } = await supabase
      .from("submissions")
      .insert({
        ...data,
        match_strengths: data.match_strengths ?? null,
        match_gaps: data.match_gaps ?? null,
        submitted_by: stage !== "draft" ? userId : null,
        submitted_at,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await writeAudit({
      actorId: userId,
      actorEmail: (claims as { email?: string })?.email ?? null,
      action: "submission.create",
      entityType: "submission",
      entityId: row.id,
      metadata: { stage },
    });

    return { id: row.id };
  });

// ------- update basic fields -------
export const updateSubmission = createServerFn({ method: "POST" })
  .middleware([requireSubmissionsAccess])
  .validator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        values: SubmissionInputSchema.partial().omit({
          requirement_id: true,
          candidate_id: true,
          stage: true,
        }),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    if (data.values.resume_version_id) {
      const { data: submission, error: submissionError } = await supabase
        .from("submissions")
        .select("candidate_id, requirement_id")
        .eq("id", data.id)
        .maybeSingle();
      if (submissionError) throw new Error(submissionError.message);
      if (!submission) throw new Error("Submission not found");
      await requireApprovedResumeVersion(
        supabase,
        data.values.resume_version_id,
        submission.candidate_id,
        submission.requirement_id,
      );
    }
    const { data: updated, error } = await supabase
      .from("submissions")
      .update(data.values)
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Submission not found or update not authorized");
    await writeAudit({
      actorId: userId,
      actorEmail: (claims as { email?: string })?.email ?? null,
      action: "submission.update",
      entityType: "submission",
      entityId: data.id,
      metadata: { fields: Object.keys(data.values) },
    });
    return { ok: true };
  });

// ------- change stage -------
export const changeSubmissionStage = createServerFn({ method: "POST" })
  .middleware([requireSubmissionsAccess])
  .validator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        to_stage: z.enum(STAGES),
        message: z.string().max(2000).optional(),
        rejected_reason: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { data: current, error: gErr } = await supabase
      .from("submissions")
      .select(
        "id, stage, submitted_at, candidate_id, requirement_id, resume_version_id, client_id, vendor_id, submitted_rate, rate_type, currency",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!current) throw new Error("Submission not found");

    if (data.to_stage !== "draft") {
      if (!current.resume_version_id) {
        throw new Error("Approve and attach a fact-validated tailored resume before submitting");
      }
      await requireApprovedResumeVersion(
        supabase,
        current.resume_version_id,
        current.candidate_id,
        current.requirement_id,
      );
    }

    const patch: {
      stage: (typeof STAGES)[number];
      submitted_at?: string;
      submitted_by?: string;
      rejected_reason?: string;
    } = { stage: data.to_stage };
    if (!current.submitted_at && data.to_stage !== "draft") {
      patch.submitted_at = new Date().toISOString();
      patch.submitted_by = userId;
    }
    if (data.to_stage === "rejected" && data.rejected_reason) {
      patch.rejected_reason = data.rejected_reason;
    }

    const { data: updated, error: uErr } = await supabase
      .from("submissions")
      .update(patch)
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (uErr) throw new Error(uErr.message);
    if (!updated) throw new Error("Submission not found or stage update not authorized");

    if (data.message) {
      const { error: noteError } = await supabase.from("submission_events").insert({
        submission_id: data.id,
        event_type: "note_added",
        actor_id: userId,
        actor_email: (claims as { email?: string })?.email ?? null,
        message: data.message,
        metadata: { stage_context: data.to_stage },
      });
      if (noteError) throw new Error(`Unable to record stage note: ${noteError.message}`);
    }

    // Auto-create placement on 'hired' if not exists
    if (data.to_stage === "hired") {
      const { data: existing } = await supabase
        .from("placements")
        .select("id")
        .eq("submission_id", data.id)
        .maybeSingle();
      if (!existing) {
        const { error: placementError } = await supabase.from("placements").insert({
          submission_id: data.id,
          candidate_id: current.candidate_id,
          requirement_id: current.requirement_id,
          client_id: current.client_id,
          vendor_id: current.vendor_id,
          bill_rate: current.submitted_rate,
          rate_type: current.rate_type,
          currency: current.currency ?? "USD",
          start_date: new Date().toISOString().slice(0, 10),
          status: "active",
          created_by: userId,
        });
        if (placementError)
          throw new Error(`Unable to create placement: ${placementError.message}`);
      }
      // The RPC validates the hired submission and current candidate ownership,
      // then records the status transition atomically in status history.
      const { error: candidateError } = await supabase.rpc(
        "mark_candidate_placed_from_submission",
        { _submission_id: data.id },
      );
      if (candidateError)
        throw new Error(`Unable to update candidate status: ${candidateError.message}`);
    }

    await writeAudit({
      actorId: userId,
      actorEmail: (claims as { email?: string })?.email ?? null,
      action: "submission.stage_change",
      entityType: "submission",
      entityId: data.id,
      metadata: { from: current.stage, to: data.to_stage },
    });

    return { ok: true };
  });

// ------- add note -------
export const addSubmissionNote = createServerFn({ method: "POST" })
  .middleware([requireSubmissionsAccess])
  .validator((i: unknown) =>
    z.object({ id: z.string().uuid(), message: z.string().trim().min(1).max(4000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { error } = await supabase.from("submission_events").insert({
      submission_id: data.id,
      event_type: "note_added",
      message: data.message,
      actor_id: userId,
      actor_email: (claims as { email?: string })?.email ?? null,
    });
    if (error) throw new Error(error.message);
    await writeAudit({
      actorId: userId,
      actorEmail: (claims as { email?: string })?.email ?? null,
      action: "submission.note_added",
      entityType: "submission",
      entityId: data.id,
    });
    return { ok: true };
  });

// ------- mark email sent -------
export const markSubmissionEmailSent = createServerFn({ method: "POST" })
  .middleware([requireSubmissionsAccess])
  .validator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("submissions")
      .update({ email_sent_at: now })
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Submission not found or email update not authorized");
    const { error: eventError } = await supabase.from("submission_events").insert({
      submission_id: data.id,
      event_type: "email_sent",
      actor_id: userId,
      actor_email: (claims as { email?: string })?.email ?? null,
      message: "Marked intro email as sent",
    });
    if (eventError) throw new Error(`Unable to record email event: ${eventError.message}`);
    await writeAudit({
      actorId: userId,
      actorEmail: (claims as { email?: string })?.email ?? null,
      action: "submission.email_sent",
      entityType: "submission",
      entityId: data.id,
      metadata: { email_sent_at: now },
    });
    return { ok: true };
  });

// ------- delete -------
export const deleteSubmission = createServerFn({ method: "POST" })
  .middleware([requireSubmissionsAccess])
  .validator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { data: deleted, error } = await supabase
      .from("submissions")
      .delete()
      .eq("id", data.id)
      .select("id, stage, candidate_id, requirement_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deleted) throw new Error("Submission not found or deletion not authorized");
    await writeAudit({
      actorId: userId,
      actorEmail: (claims as { email?: string })?.email ?? null,
      action: "submission.delete",
      entityType: "submission",
      entityId: deleted.id,
      metadata: {
        stage: deleted.stage,
        candidate_id: deleted.candidate_id,
        requirement_id: deleted.requirement_id,
      },
    });
    return { ok: true };
  });

// ------- Fact-preserving submission email -------
export const draftSubmissionEmail = createServerFn({ method: "POST" })
  .middleware([requireSubmissionsAccess])
  .validator((i: unknown) =>
    z
      .object({
        requirement_id: z.string().uuid(),
        candidate_id: z.string().uuid(),
        resume_version_id: z.string().uuid().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let versionQuery = supabase
      .from("resume_versions")
      .select(
        "id, candidate_id, requirement_id, version_no, status, source_hash, source_facts, claim_validation",
      )
      .eq("candidate_id", data.candidate_id)
      .eq("requirement_id", data.requirement_id)
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
      .limit(1);
    if (data.resume_version_id) versionQuery = versionQuery.eq("id", data.resume_version_id);

    const { data: versions, error } = await versionQuery;
    if (error) throw new Error(error.message);
    const version = versions?.[0];
    if (!version) {
      throw new Error("Approve a fact-validated tailored resume before drafting submission text");
    }
    await requireApprovedResumeVersion(
      supabase,
      version.id,
      data.candidate_id,
      data.requirement_id,
    );

    const facts = version.source_facts as {
      candidate?: {
        first_name?: string;
        last_name?: string;
        current_title?: string | null;
        current_employer?: string | null;
        location?: string | null;
        visa_status?: string | null;
        availability?: string | null;
      };
      requirement?: { title?: string };
      skills?: Array<{ id?: string; skill?: string }>;
    };
    const validation = version.claim_validation as {
      valid?: boolean;
      selection?: { skill_ids?: string[] };
    };
    if (validation.valid !== true || !facts.candidate || !facts.requirement?.title) {
      throw new Error("Approved resume evidence is incomplete");
    }

    const candidateName = [facts.candidate.first_name, facts.candidate.last_name]
      .filter(Boolean)
      .join(" ");
    const selectedSkillIds = new Set(validation.selection?.skill_ids ?? []);
    const selectedSkills = (facts.skills ?? [])
      .filter((skill) => skill.id && selectedSkillIds.has(skill.id))
      .map((skill) => skill.skill)
      .filter((skill): skill is string => Boolean(skill));
    const highlights = [
      facts.candidate.current_title || facts.candidate.current_employer
        ? `- Current role: ${[facts.candidate.current_title, facts.candidate.current_employer]
            .filter(Boolean)
            .join(" | ")}`
        : null,
      selectedSkills.length ? `- Verified skills: ${selectedSkills.join(", ")}` : null,
      facts.candidate.location ? `- Location: ${facts.candidate.location}` : null,
      facts.candidate.visa_status ? `- Work authorization: ${facts.candidate.visa_status}` : null,
      facts.candidate.availability ? `- Availability: ${facts.candidate.availability}` : null,
    ].filter((line): line is string => Boolean(line));

    return {
      subject: `Submission — ${facts.requirement.title} — ${candidateName}`,
      body: [
        "Hello,",
        "",
        `Please consider ${candidateName} for ${facts.requirement.title}.`,
        "",
        "Verified candidate facts:",
        ...highlights,
        "",
        `The attached tailored resume is approved version ${version.version_no}.`,
        "",
        "Please let me know if you would like to discuss next steps.",
      ].join("\n"),
      resume_version_id: version.id,
    };
  });

// ------- KPI counts for dashboard -------
export const getSubmissionKpis = createServerFn({ method: "GET" })
  .middleware([requireSubmissionsAccess])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [
      { count: submissionsThisWeek },
      { count: interviewsScheduled },
      { count: activePlacements },
      { count: openStages },
    ] = await Promise.all([
      supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .gte("submitted_at", weekAgo),
      supabase
        .from("interviews")
        .select("id", { count: "exact", head: true })
        .eq("outcome", "scheduled"),
      supabase
        .from("placements")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .in("stage", ["submitted", "vendor_review", "client_review", "interview", "offer"]),
    ]);
    return {
      submissionsThisWeek: submissionsThisWeek ?? 0,
      interviewsScheduled: interviewsScheduled ?? 0,
      activePlacements: activePlacements ?? 0,
      openSubmissions: openStages ?? 0,
    };
  });
