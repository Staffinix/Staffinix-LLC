import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireCandidatesAccess } from "@/integrations/supabase/auth-middleware";
import type { SupabaseAuthContext } from "@/integrations/supabase/auth-middleware";
import { ForbiddenError } from "@/lib/authorization-policy";

const CandidateStatusSchema = z.enum(["active", "submitted", "placed", "on_hold", "inactive"]);

async function requireL2(context: SupabaseAuthContext) {
  const { getUserRoles, isAdminRole } = await import("@/lib/rbac.server");
  const roles = await getUserRoles(context.supabase, context.userId);
  if (!isAdminRole(roles)) {
    throw new ForbiddenError("L2 administrator permission is required.");
  }

  const { data: profile, error } = await context.supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (error || !profile?.tenant_id) {
    throw new ForbiddenError("Your tenant could not be verified.");
  }

  return profile.tenant_id;
}

export const listEligibleL4Recruiters = createServerFn({ method: "GET" })
  .middleware([requireCandidatesAccess])
  .handler(async ({ context }) => {
    const tenantId = await requireL2(context);
    const { data: roleRows, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "recruiter");
    if (rolesError) throw new Error("Unable to load eligible recruiters.");

    const recruiterIds = [...new Set((roleRows ?? []).map((row) => row.user_id))];
    if (recruiterIds.length === 0) return [];

    const { data: profiles, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url, is_active")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .in("id", recruiterIds)
      .order("full_name", { ascending: true })
      .limit(500);
    if (error) throw new Error("Unable to load eligible recruiters.");

    return profiles ?? [];
  });

const AssignCandidatesSchema = z
  .object({
    candidateIds: z.array(z.string().uuid()).min(1).max(100),
    recruiterId: z.string().uuid(),
  })
  .strict()
  .transform((value) => ({
    ...value,
    candidateIds: [...new Set(value.candidateIds)],
  }));

export const assignCandidatesToRecruiter = createServerFn({ method: "POST" })
  .middleware([requireCandidatesAccess])
  .validator((input: unknown) => AssignCandidatesSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireL2(context);
    const { data: assignments, error } = await context.supabase.rpc(
      "assign_candidates_to_recruiter",
      {
        _candidate_ids: data.candidateIds,
        _recruiter_id: data.recruiterId,
      },
    );
    if (error) throw new Error(`Candidate assignment failed: ${error.message}`);

    const { writeAudit } = await import("@/lib/audit.server");
    await writeAudit({
      actorId: context.userId,
      actorEmail: (context.claims.email as string | undefined) ?? null,
      action: "candidate.assignment.changed",
      entityType: "candidate_assignment",
      entityId: data.recruiterId,
      metadata: {
        candidateIds: data.candidateIds,
        recruiterId: data.recruiterId,
        assignmentCount: assignments?.length ?? 0,
      },
    });

    return { assignments: assignments ?? [] };
  });

const CandidateManagementSchema = z.object({ candidateId: z.string().uuid() }).strict();

export const getCandidateManagement = createServerFn({ method: "POST" })
  .middleware([requireCandidatesAccess])
  .validator((input: unknown) => CandidateManagementSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: candidate, error: candidateError } = await context.supabase
      .from("candidates")
      .select("id, assigned_to, assigned_at, assigned_by")
      .eq("id", data.candidateId)
      .maybeSingle();
    if (candidateError) throw new Error("Unable to load candidate assignment.");
    if (!candidate) throw new Error("Candidate not found or access denied.");

    const [assignmentHistoryResult, statusHistoryResult, submissionsResult] = await Promise.all([
      context.supabase
        .from("candidate_assignment_history")
        .select("id, previous_recruiter_id, new_recruiter_id, changed_by, changed_at")
        .eq("candidate_id", data.candidateId)
        .order("changed_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("candidate_status_history")
        .select("id, previous_status, new_status, changed_by, changed_at")
        .eq("candidate_id", data.candidateId)
        .order("changed_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("submissions")
        .select(
          "id, requirement_id, stage, submitted_by, submitted_at, candidate_status_at_submission, created_at, updated_at",
        )
        .eq("candidate_id", data.candidateId)
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (assignmentHistoryResult.error) {
      throw new Error("Unable to load assignment history.");
    }
    if (statusHistoryResult.error) throw new Error("Unable to load status history.");
    if (submissionsResult.error) throw new Error("Unable to load submission history.");

    const assignmentHistory = assignmentHistoryResult.data ?? [];
    const statusHistory = statusHistoryResult.data ?? [];
    const submissions = submissionsResult.data ?? [];
    const profileIds = new Set<string>();
    if (candidate.assigned_to) profileIds.add(candidate.assigned_to);
    if (candidate.assigned_by) profileIds.add(candidate.assigned_by);
    for (const row of assignmentHistory) {
      if (row.previous_recruiter_id) profileIds.add(row.previous_recruiter_id);
      profileIds.add(row.new_recruiter_id);
      profileIds.add(row.changed_by);
    }
    for (const row of statusHistory) profileIds.add(row.changed_by);
    for (const row of submissions) if (row.submitted_by) profileIds.add(row.submitted_by);

    const { data: profiles, error: profilesError } = profileIds.size
      ? await context.supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .in("id", [...profileIds])
      : { data: [], error: null };
    if (profilesError) throw new Error("Unable to resolve candidate activity users.");

    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const resolveProfile = (id: string | null) => (id ? (profileById.get(id) ?? null) : null);

    return {
      assignment: {
        recruiter: resolveProfile(candidate.assigned_to),
        assignedBy: resolveProfile(candidate.assigned_by),
        assignedAt: candidate.assigned_at,
      },
      assignmentHistory: assignmentHistory.map((row) => ({
        ...row,
        previousRecruiter: resolveProfile(row.previous_recruiter_id),
        newRecruiter: resolveProfile(row.new_recruiter_id),
        changedBy: resolveProfile(row.changed_by),
      })),
      statusHistory: statusHistory.map((row) => ({
        ...row,
        changedBy: resolveProfile(row.changed_by),
      })),
      submissions: submissions.map((row) => ({
        ...row,
        submittedBy: resolveProfile(row.submitted_by),
      })),
    };
  });

const UpdateCandidateStatusSchema = z
  .object({
    candidateId: z.string().uuid(),
    status: CandidateStatusSchema,
    expectedUpdatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const updateCandidateStatus = createServerFn({ method: "POST" })
  .middleware([requireCandidatesAccess])
  .validator((input: unknown) => UpdateCandidateStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireL2(context);
    const { data: rows, error } = await context.supabase.rpc("update_candidate_status", {
      _candidate_id: data.candidateId,
      _new_status: data.status,
      _expected_updated_at: data.expectedUpdatedAt,
    });
    if (error) {
      if (error.code === "40001") {
        throw new Error("This candidate changed after you opened it. Refresh and try again.");
      }
      throw new Error(`Candidate status update failed: ${error.message}`);
    }

    const updated = rows?.[0];
    if (!updated) throw new Error("Candidate status was not updated.");

    const { writeAudit } = await import("@/lib/audit.server");
    await writeAudit({
      actorId: context.userId,
      actorEmail: (context.claims.email as string | undefined) ?? null,
      action: "candidate.status.changed",
      entityType: "candidate",
      entityId: data.candidateId,
      metadata: {
        previousStatus: updated.previous_status,
        newStatus: updated.new_status,
      },
    });

    return updated;
  });
