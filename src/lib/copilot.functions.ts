import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireDashboardAccess } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  requestStructuredAiOutput,
  UNTRUSTED_DOCUMENT_SYSTEM_RULES,
} from "@/lib/ai-gateway.server";
import { writeAudit } from "@/lib/audit.server";
import { runWithAiUsageGuard } from "@/lib/ai-usage.server";
import {
  answerWithRag,
  getRagHealth,
  type RagDocument,
  type RagRetrievedChunk,
} from "@/lib/rag.server";

const COPILOT_MODEL = "google/gemini-3-flash-preview";
const COPILOT_PROMPT_VERSION = "copilot-qdrant-rag-v3";

const CopilotSourceSchema = z
  .object({
    key: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(180),
    path: z
      .string()
      .trim()
      .regex(/^\/[a-z0-9/_-]+$/i),
    type: z.enum([
      "requirement",
      "candidate",
      "submission",
      "interview",
      "placement",
      "client",
      "vendor",
    ]),
  })
  .strict();

export type CopilotSource = z.infer<typeof CopilotSourceSchema>;

const CopilotMessageSchema = z
  .object({
    id: z.string().uuid(),
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(6_000),
    sources: z.array(CopilotSourceSchema).max(8),
    created_at: z.string(),
  })
  .strict();

export type CopilotMessage = z.infer<typeof CopilotMessageSchema>;

const CopilotRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(2_000),
  })
  .strict();

const AiCopilotResponseSchema = z
  .object({
    answer: z.string().trim().min(1).max(6_000),
    source_ids: z.array(z.string().trim().min(1).max(100)).max(8).default([]),
  })
  .strict();

type CopilotSupabase = SupabaseClient<Database>;
type ContextSnapshot = Awaited<ReturnType<typeof loadCopilotContext>>;

function parseStoredSources(value: Json): CopilotSource[] {
  const parsed = z.array(CopilotSourceSchema).max(8).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function sourceCatalog(snapshot: ContextSnapshot): Map<string, CopilotSource> {
  const sources: CopilotSource[] = [
    ...snapshot.requirements.map((item) => ({
      key: `requirement:${item.id}`,
      label: item.title,
      path: `/requirements/${item.id}`,
      type: "requirement" as const,
    })),
    ...snapshot.candidates.map((item) => ({
      key: `candidate:${item.id}`,
      label: `${item.first_name} ${item.last_name}`,
      path: `/candidates/${item.id}`,
      type: "candidate" as const,
    })),
    ...snapshot.submissions.map((item) => ({
      key: `submission:${item.id}`,
      label: `Submission · ${item.stage.replaceAll("_", " ")}`,
      path: `/submissions/${item.id}`,
      type: "submission" as const,
    })),
    ...snapshot.interviews.map((item) => ({
      key: `interview:${item.id}`,
      label: `Interview · ${item.round.replaceAll("_", " ")}`,
      path: "/interviews",
      type: "interview" as const,
    })),
    ...snapshot.placements.map((item) => ({
      key: `placement:${item.id}`,
      label: `Placement · ${item.status.replaceAll("_", " ")}`,
      path: "/placements",
      type: "placement" as const,
    })),
    ...snapshot.clients.map((item) => ({
      key: `client:${item.id}`,
      label: item.name,
      path: `/clients/${item.id}`,
      type: "client" as const,
    })),
    ...snapshot.vendors.map((item) => ({
      key: `vendor:${item.id}`,
      label: item.name,
      path: `/vendors/${item.id}`,
      type: "vendor" as const,
    })),
  ];
  return new Map(sources.map((source) => [source.key, source]));
}

async function loadCopilotContext(supabase: CopilotSupabase) {
  const [requirements, candidates, submissions, interviews, placements, clients, vendors, resumes] =
    await Promise.all([
      supabase
        .from("requirements")
        .select(
          "id, title, status, priority, primary_technology, location, work_mode, description, created_at, requirement_skills(skill, is_mandatory)",
        )
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("candidates")
        .select(
          "id, first_name, last_name, current_title, required_job, primary_technology, location, preferred_location, ready_to_relocate, visa_status, availability, experience_years, status, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("submissions")
        .select("id, candidate_id, requirement_id, stage, match_score, created_at")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("interviews")
        .select("id, submission_id, round, outcome, scheduled_at, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("placements")
        .select("id, candidate_id, requirement_id, status, start_date, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("clients")
        .select("id, name, industry, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("vendors")
        .select("id, name, contact_name, contact_role, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("resumes")
        .select("id, candidate_id, file_name, extracted_text, created_at")
        .not("extracted_text", "is", null)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

  const failed = [
    requirements,
    candidates,
    submissions,
    interviews,
    placements,
    clients,
    vendors,
    resumes,
  ]
    .map((result) => result.error)
    .find(Boolean);
  if (failed) throw new Error("Unable to load Copilot context.");

  return {
    requirements: requirements.data ?? [],
    candidates: candidates.data ?? [],
    submissions: submissions.data ?? [],
    interviews: interviews.data ?? [],
    placements: placements.data ?? [],
    clients: clients.data ?? [],
    vendors: vendors.data ?? [],
    resumes: resumes.data ?? [],
  };
}

function buildRagDocuments(snapshot: ContextSnapshot): RagDocument[] {
  const candidatesById = new Map(snapshot.candidates.map((candidate) => [candidate.id, candidate]));
  return [
    ...snapshot.requirements.map((item) => ({
      documentId: `requirement:${item.id}`,
      sourceKey: `requirement:${item.id}`,
      sourceLabel: item.title,
      sourcePath: `/requirements/${item.id}`,
      sourceType: "requirement" as const,
      content: [
        `Requirement: ${item.title}.`,
        `Status: ${item.status}. Priority: ${item.priority}.`,
        item.primary_technology ? `Primary technology: ${item.primary_technology}.` : "",
        item.location ? `Location: ${item.location}.` : "",
        item.work_mode ? `Work mode: ${item.work_mode}.` : "",
        item.description ?? "",
        item.requirement_skills.some((skill) => skill.is_mandatory)
          ? `Mandatory skills: ${item.requirement_skills
              .filter((skill) => skill.is_mandatory)
              .map((skill) => skill.skill)
              .join(", ")}.`
          : "",
        item.requirement_skills.some((skill) => !skill.is_mandatory)
          ? `Preferred skills: ${item.requirement_skills
              .filter((skill) => !skill.is_mandatory)
              .map((skill) => skill.skill)
              .join(", ")}.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    })),
    ...snapshot.candidates.map((item) => ({
      documentId: `candidate:${item.id}`,
      sourceKey: `candidate:${item.id}`,
      sourceLabel: `${item.first_name} ${item.last_name}`,
      sourcePath: `/candidates/${item.id}`,
      sourceType: "candidate" as const,
      content: [
        `Candidate: ${item.first_name} ${item.last_name}. Status: ${item.status}.`,
        item.current_title ? `Current job: ${item.current_title}.` : "",
        item.required_job ? `Required job: ${item.required_job}.` : "",
        item.primary_technology ? `Primary technology: ${item.primary_technology}.` : "",
        item.experience_years != null ? `Experience: ${item.experience_years} years.` : "",
        item.location ? `Location: ${item.location}.` : "",
        item.ready_to_relocate != null
          ? `Ready to relocate: ${item.ready_to_relocate ? "yes" : "no"}.`
          : "",
        item.preferred_location ? `Preferred location: ${item.preferred_location}.` : "",
        item.visa_status ? `Visa status: ${item.visa_status}.` : "",
        item.availability ? `Availability: ${item.availability}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    })),
    ...snapshot.resumes.flatMap((resume) => {
      const candidate = candidatesById.get(resume.candidate_id);
      if (!candidate || !resume.extracted_text?.trim()) return [];
      const name = `${candidate.first_name} ${candidate.last_name}`;
      return [
        {
          documentId: `resume:${resume.id}`,
          sourceKey: `candidate:${candidate.id}`,
          sourceLabel: `${name} · ${resume.file_name}`,
          sourcePath: `/candidates/${candidate.id}`,
          sourceType: "candidate" as const,
          content: `Resume for ${name}. ${resume.extracted_text}`,
        },
      ];
    }),
    ...snapshot.clients.map((item) => ({
      documentId: `client:${item.id}`,
      sourceKey: `client:${item.id}`,
      sourceLabel: item.name,
      sourcePath: `/clients/${item.id}`,
      sourceType: "client" as const,
      content: `Client: ${item.name}. Industry: ${item.industry ?? "not recorded"}. Status: ${item.status}.`,
    })),
    ...snapshot.vendors.map((item) => ({
      documentId: `vendor:${item.id}`,
      sourceKey: `vendor:${item.id}`,
      sourceLabel: item.name,
      sourcePath: `/vendors/${item.id}`,
      sourceType: "vendor" as const,
      content: `Vendor: ${item.name}. Contact: ${item.contact_name ?? "not recorded"}. Role: ${item.contact_role ?? "not recorded"}. Status: ${item.status}.`,
    })),
  ];
}

function sourcesFromRagChunks(chunks: RagRetrievedChunk[]): CopilotSource[] {
  const sources = new Map<string, CopilotSource>();
  for (const chunk of chunks) {
    const parsed = CopilotSourceSchema.safeParse({
      key: chunk.sourceKey,
      label: chunk.sourceLabel,
      path: chunk.sourcePath,
      type: chunk.sourceType,
    });
    if (parsed.success && !sources.has(parsed.data.key)) sources.set(parsed.data.key, parsed.data);
  }
  return [...sources.values()].slice(0, 8);
}

function countBy(items: Array<Record<string, unknown>>, field: string) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const value = String(item[field] ?? "unknown").replaceAll("_", " ");
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function formatCounts(counts: Record<string, number>) {
  const entries = Object.entries(counts);
  return entries.length ? entries.map(([name, count]) => `${name}: ${count}`).join(", ") : "none";
}

function localGroundedAnswer(question: string, snapshot: ContextSnapshot) {
  const q = question.toLowerCase();
  const catalog = sourceCatalog(snapshot);
  let sourceIds: string[] = [];
  let answer: string;

  if (/candidate|bench|talent|resume/.test(q)) {
    const available = snapshot.candidates.filter((candidate) => candidate.status === "active");
    sourceIds = available.slice(0, 5).map((candidate) => `candidate:${candidate.id}`);
    const lines = available.slice(0, 5).map((candidate) => {
      const role = candidate.current_title || candidate.primary_technology || "Role not recorded";
      return `- **${candidate.first_name} ${candidate.last_name}** — ${role}; ${candidate.availability ?? "availability unknown"}`;
    });
    answer = `There are **${available.length} active candidates** in the current Staffinix context.${
      lines.length ? `\n\n${lines.join("\n")}` : ""
    }`;
  } else if (/requisition|requirement|opening|job/.test(q)) {
    sourceIds = snapshot.requirements.slice(0, 5).map((item) => `requirement:${item.id}`);
    const lines = snapshot.requirements
      .slice(0, 5)
      .map((item) => `- **${item.title}** — ${item.status}; priority ${item.priority}`);
    answer = `The latest **${snapshot.requirements.length} requisitions** break down as ${formatCounts(
      countBy(snapshot.requirements, "status"),
    )}.${lines.length ? `\n\n${lines.join("\n")}` : ""}`;
  } else if (/submission|pipeline|stage|bottleneck/.test(q)) {
    sourceIds = snapshot.submissions.slice(0, 5).map((item) => `submission:${item.id}`);
    answer = `The current submission pipeline contains **${snapshot.submissions.length} recent records**. Stage distribution: ${formatCounts(
      countBy(snapshot.submissions, "stage"),
    )}.`;
  } else if (/interview|schedule/.test(q)) {
    sourceIds = snapshot.interviews.slice(0, 5).map((item) => `interview:${item.id}`);
    answer = `There are **${snapshot.interviews.length} recent interviews** in view. Outcomes: ${formatCounts(
      countBy(snapshot.interviews, "outcome"),
    )}.`;
  } else if (/placement|revenue/.test(q)) {
    sourceIds = snapshot.placements.slice(0, 5).map((item) => `placement:${item.id}`);
    answer = `There are **${snapshot.placements.length} recent placements**. Status distribution: ${formatCounts(
      countBy(snapshot.placements, "status"),
    )}.`;
  } else if (/client|customer/.test(q)) {
    sourceIds = snapshot.clients.slice(0, 5).map((item) => `client:${item.id}`);
    answer = `There are **${snapshot.clients.length} clients** in the current context. Status distribution: ${formatCounts(
      countBy(snapshot.clients, "status"),
    )}.`;
  } else if (/vendor|supplier/.test(q)) {
    sourceIds = snapshot.vendors.slice(0, 5).map((item) => `vendor:${item.id}`);
    answer = `There are **${snapshot.vendors.length} vendors** in the current context. Status distribution: ${formatCounts(
      countBy(snapshot.vendors, "status"),
    )}.`;
  } else {
    answer = `Here is the live Staffinix snapshot:\n\n- **${snapshot.requirements.length}** recent requisitions\n- **${snapshot.candidates.length}** recent candidates\n- **${snapshot.submissions.length}** recent submissions\n- **${snapshot.interviews.length}** recent interviews\n- **${snapshot.placements.length}** recent placements\n- **${snapshot.clients.length}** clients\n- **${snapshot.vendors.length}** vendors\n\nAsk about any one area for a grounded breakdown. External AI generation is optional and no API key is required for these live summaries.`;
  }

  return {
    answer,
    sources: sourceIds
      .map((id) => catalog.get(id))
      .filter((source): source is CopilotSource => Boolean(source)),
    mode: "local" as const,
  };
}

export const listCopilotMessages = createServerFn({ method: "POST" })
  .middleware([requireDashboardAccess])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("copilot_messages")
      .select("id, role, content, sources, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(80);
    if (error) throw new Error("Unable to load Copilot history.");

    return (data ?? [])
      .sort((left, right) => {
        const timestampDifference =
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
        if (timestampDifference !== 0) return timestampDifference;
        if (left.role !== right.role) return left.role === "user" ? -1 : 1;
        return left.id.localeCompare(right.id);
      })
      .map((message) =>
        CopilotMessageSchema.parse({ ...message, sources: parseStoredSources(message.sources) }),
      );
  });

export const clearCopilotHistory = createServerFn({ method: "POST" })
  .middleware([requireDashboardAccess])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("copilot_messages")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error("Unable to clear Copilot history.");
    return { ok: true };
  });

export const getCopilotRagStatus = createServerFn({ method: "GET" })
  .middleware([requireDashboardAccess])
  .handler(async () => getRagHealth());

export const askCopilot = createServerFn({ method: "POST" })
  .middleware([requireDashboardAccess])
  .validator((input: unknown) => CopilotRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [snapshot, historyResult, profileResult] = await Promise.all([
      loadCopilotContext(context.supabase),
      context.supabase
        .from("copilot_messages")
        .select("id, role, content, created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(12),
      context.supabase.from("profiles").select("tenant_id").eq("id", context.userId).maybeSingle(),
    ]);
    if (historyResult.error) throw new Error("Unable to load Copilot history.");
    if (profileResult.error || !profileResult.data) {
      throw new Error("Unable to resolve the Copilot tenant boundary.");
    }
    const copilotTenantScope = profileResult.data.tenant_id ?? `platform:${context.userId}`;

    const conversationHistory = (historyResult.data ?? []).sort((left, right) => {
      const timestampDifference =
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      if (timestampDifference !== 0) return timestampDifference;
      if (left.role !== right.role) return left.role === "user" ? -1 : 1;
      return left.id.localeCompare(right.id);
    });

    const catalog = sourceCatalog(snapshot);
    const { response, indexedChunks, ragAvailable } = await runWithAiUsageGuard(
      context.supabase,
      context.userId,
      "copilot",
      async () => {
        let guardedResponse: {
          answer: string;
          sources: CopilotSource[];
          mode: "ai" | "local" | "rag" | "rag-extractive";
        };
        let guardedIndexedChunks = 0;
        let guardedRagAvailable = true;

        try {
          const rag = await answerWithRag({
            tenantId: copilotTenantScope,
            question: data.question,
            documents: buildRagDocuments(snapshot),
            history: conversationHistory,
          });
          guardedIndexedChunks = rag.indexedChunks;
          guardedResponse = {
            answer: rag.answer,
            sources: sourcesFromRagChunks(rag.chunks),
            mode: rag.mode,
          };
        } catch {
          guardedRagAvailable = false;
          if (!process.env.LOVABLE_API_KEY?.trim()) {
            guardedResponse = localGroundedAnswer(data.question, snapshot);
          } else {
            const ai = await requestStructuredAiOutput(
              {
                model: COPILOT_MODEL,
                temperature: 0.2,
                max_completion_tokens: 1_000,
                response_format: { type: "json_object" },
                messages: [
                  {
                    role: "system",
                    content: `${UNTRUSTED_DOCUMENT_SYSTEM_RULES}
You are the read-only Staffinix recruiting operations assistant.
Answer only from the supplied tenant-scoped context and conversation history. If evidence is insufficient, say so.
Never claim to perform writes, send messages, change stages, approve access, or contact people.
Never make or recommend automatic hiring/rejection decisions. Present factual comparisons for human review.
The context records have source keys such as candidate:<uuid>. Cite only keys present in the context.
Return JSON with exactly: {"answer": string, "source_ids": string[]}.`,
                  },
                  {
                    role: "user",
                    content: `<conversation_history>${JSON.stringify(
                      conversationHistory,
                    )}</conversation_history>\n<user_request>${data.question}</user_request>\n<untrusted_context>${JSON.stringify(
                      snapshot,
                    )}</untrusted_context>`,
                  },
                ],
              },
              AiCopilotResponseSchema,
            );
            guardedResponse = {
              answer: ai.answer,
              sources: (ai.source_ids ?? [])
                .map((id) => catalog.get(id))
                .filter((source): source is CopilotSource => Boolean(source)),
              mode: "ai",
            };
          }
        }

        return {
          response: guardedResponse,
          indexedChunks: guardedIndexedChunks,
          ragAvailable: guardedRagAvailable,
        };
      },
    );

    const userCreatedAt = new Date();
    const assistantCreatedAt = new Date(userCreatedAt.getTime() + 1);
    const { data: stored, error: storeError } = await context.supabase
      .from("copilot_messages")
      .insert([
        {
          role: "user",
          content: data.question,
          sources: [],
          created_at: userCreatedAt.toISOString(),
        },
        {
          role: "assistant",
          content: response.answer,
          sources: response.sources as unknown as Json,
          created_at: assistantCreatedAt.toISOString(),
        },
      ])
      .select("id, role, content, sources, created_at");
    if (storeError || !stored || stored.length !== 2) {
      throw new Error("Copilot answered, but the conversation could not be saved.");
    }

    await writeAudit({
      actorId: context.userId,
      actorEmail: (context.claims.email as string | undefined) ?? null,
      action: "copilot.answer_generated",
      entityType: "copilot",
      metadata: {
        mode: response.mode,
        model:
          response.mode === "ai"
            ? COPILOT_MODEL
            : response.mode.startsWith("rag")
              ? process.env.OLLAMA_CHAT_MODEL?.trim() || "gemma3:4b"
              : null,
        prompt_version: COPILOT_PROMPT_VERSION,
        source_count: response.sources.length,
        rag_available: ragAvailable,
        indexed_chunks: indexedChunks,
      },
    });

    const assistant = stored.find((message) => message.role === "assistant");
    return CopilotMessageSchema.parse({
      id: assistant?.id,
      role: "assistant",
      content: response.answer,
      sources: response.sources,
      created_at: assistant?.created_at,
    });
  });
