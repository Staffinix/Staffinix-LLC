import { createServerFn } from "@tanstack/react-start";
import { requireRequirementsAccess } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { TablesUpdate } from "@/integrations/supabase/types";
import {
  requestStructuredAiOutput,
  UNTRUSTED_DOCUMENT_SYSTEM_RULES,
} from "@/lib/ai-gateway.server";
import { processDocumentInIsolatedWorker } from "@/lib/document-processing.server";
import { runWithAiUsageGuard } from "@/lib/ai-usage.server";

// ------------- shared schemas -------------

const STATUSES = ["open", "closed", "expired"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const WORK_MODES = ["onsite", "remote", "hybrid"] as const;
const RATE_TYPES = ["hourly", "annual", "monthly"] as const;
const SOURCES = ["manual", "paste", "pdf", "docx", "email"] as const;

const REQUIREMENT_DETAIL_FIELDS =
  "id, title, client_id, vendor_id, location, work_mode, visa_types, rate_min, rate_max, rate_type, currency, min_experience_years, max_experience_years, primary_technology, description, recruiter_notes, status, priority, source, duration, assigned_to, assigned_at, created_by, created_at, updated_at";

const SkillSchema = z.object({
  skill: z.string().trim().min(1).max(80),
  is_mandatory: z.boolean().default(false),
});

const RequirementInputSchema = z.object({
  title: z.string().trim().min(2).max(200),
  client_id: z.string().uuid().nullable().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  work_mode: z.enum(WORK_MODES).nullable().optional(),
  visa_types: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  rate_min: z.number().nonnegative().nullable().optional(),
  rate_max: z.number().nonnegative().nullable().optional(),
  rate_type: z.enum(RATE_TYPES).nullable().optional(),
  currency: z.string().trim().min(1).max(8).default("USD"),
  min_experience_years: z.number().int().min(0).max(60).nullable().optional(),
  max_experience_years: z.number().int().min(0).max(60).nullable().optional(),
  primary_technology: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(20000).nullable().optional(),
  recruiter_notes: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(STATUSES).default("open"),
  priority: z.enum(PRIORITIES).default("medium"),
  source: z.enum(SOURCES).default("manual"),
  duration: z.string().trim().max(80).nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  skills: z.array(SkillSchema).max(80).default([]),
});

// ------------- list / filter / paginate -------------

const ListInputSchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.array(z.enum(STATUSES)).optional(),
  priority: z.array(z.enum(PRIORITIES)).optional(),
  client_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().nullable().optional(), // null = unassigned
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(20),
});

export const listRequirements = createServerFn({ method: "POST" })
  .middleware([requireRequirementsAccess])
  .validator((input: unknown) => ListInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;

    let q = supabase
      .from("requirements")
      .select(
        "id, title, status, priority, location, work_mode, primary_technology, rate_min, rate_max, rate_type, currency, visa_types, min_experience_years, max_experience_years, duration, created_at, updated_at, assigned_to, created_by, client_id, vendor_id",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data.search) q = q.ilike("title", `%${data.search}%`);
    if (data.status?.length) q = q.in("status", data.status);
    if (data.priority?.length) q = q.in("priority", data.priority);
    if (data.client_id) q = q.eq("client_id", data.client_id);
    if (data.assigned_to === null) q = q.is("assigned_to", null);
    else if (data.assigned_to) q = q.eq("assigned_to", data.assigned_to);

    const { data: rows, error, count } = await q;

    if (error) throw new Error(`Unable to load requirements: ${error.message}`);

    // Enrich with client/vendor/assignee names in a single admin-free lookup.
    const clientIds = Array.from(
      new Set(rows?.map((r) => r.client_id).filter(Boolean) as string[]),
    );
    const vendorIds = Array.from(
      new Set(rows?.map((r) => r.vendor_id).filter(Boolean) as string[]),
    );
    const userIds = Array.from(
      new Set([
        ...(rows?.map((r) => r.assigned_to).filter(Boolean) as string[]),
        ...(rows?.map((r) => r.created_by).filter(Boolean) as string[]),
      ]),
    );

    const [clients, vendors, profiles] = await Promise.all([
      clientIds.length
        ? supabase.from("clients").select("id, name").in("id", clientIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
      vendorIds.length
        ? supabase.from("vendors").select("id, name").in("id", vendorIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
      userIds.length
        ? supabase.from("profiles").select("id, full_name, email").in("id", userIds)
        : Promise.resolve({
            data: [] as { id: string; full_name: string | null; email: string }[],
            error: null,
          }),
    ]);

    const clientMap = new Map(clients.data?.map((c) => [c.id, c.name]));
    const vendorMap = new Map(vendors.data?.map((v) => [v.id, v.name]));
    const profileMap = new Map(profiles.data?.map((p) => [p.id, p]));

    return {
      rows: (rows ?? []).map((r) => ({
        ...r,
        client_name: r.client_id ? (clientMap.get(r.client_id) ?? null) : null,
        vendor_name: r.vendor_id ? (vendorMap.get(r.vendor_id) ?? null) : null,
        assignee: r.assigned_to
          ? {
              id: r.assigned_to,
              full_name: profileMap.get(r.assigned_to)?.full_name ?? null,
              email: profileMap.get(r.assigned_to)?.email ?? null,
            }
          : null,
        creator: r.created_by
          ? {
              id: r.created_by,
              full_name: profileMap.get(r.created_by)?.full_name ?? null,
              email: profileMap.get(r.created_by)?.email ?? null,
            }
          : null,
      })),
      total: count ?? 0,
      page: data.page,
      page_size: data.page_size,
    };
  });

// ------------- get one -------------

export const getRequirement = createServerFn({ method: "POST" })
  .middleware([requireRequirementsAccess])
  .validator((input: unknown) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: req, error } = await supabase
      .from("requirements")
      .select(REQUIREMENT_DETAIL_FIELDS)
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error(`Unable to load requirement: ${error.message}`);
    if (!req) throw new Error("Requirement not found or access denied");

    const [skills, client, vendor, profiles] = await Promise.all([
      supabase
        .from("requirement_skills")
        .select("id, skill, is_mandatory")
        .eq("requirement_id", data.id)
        .order("is_mandatory", { ascending: false })
        .order("skill"),
      req.client_id
        ? supabase.from("clients").select("id, name").eq("id", req.client_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      req.vendor_id
        ? supabase.from("vendors").select("id, name").eq("id", req.vendor_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", [req.assigned_to, req.created_by].filter(Boolean) as string[]),
    ]);

    const profileMap = new Map(profiles.data?.map((p) => [p.id, p]));
    return {
      ...req,
      client_name: client.data?.name ?? null,
      vendor_name: vendor.data?.name ?? null,
      skills: skills.data ?? [],
      client: client.data,
      vendor: vendor.data,
      assignee: req.assigned_to
        ? {
            id: req.assigned_to,
            full_name: profileMap.get(req.assigned_to)?.full_name ?? null,
            email: profileMap.get(req.assigned_to)?.email ?? null,
          }
        : null,
      creator: req.created_by
        ? {
            id: req.created_by,
            full_name: profileMap.get(req.created_by)?.full_name ?? null,
            email: profileMap.get(req.created_by)?.email ?? null,
          }
        : null,
    };
  });

// ------------- create -------------

export const createRequirement = createServerFn({ method: "POST" })
  .middleware([requireRequirementsAccess])
  .validator((input: unknown) => RequirementInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { skills, ...fields } = data;

    const insertPayload = {
      ...fields,
      created_by: userId,
      assigned_at: fields.assigned_to ? new Date().toISOString() : null,
    };

    const { data: created, error } = await supabase
      .from("requirements")
      .insert(insertPayload)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!created) throw new Error("Failed to create requirement");

    if (skills.length) {
      const { error: sErr } = await supabase
        .from("requirement_skills")
        .insert(skills.map((s) => ({ ...s, requirement_id: created.id })));
      if (sErr) throw new Error(sErr.message);
    }

    const { writeAudit } = await import("@/lib/audit.server");
    await writeAudit({
      actorId: userId,
      actorEmail: (claims.email as string | undefined) ?? null,
      action: "requirement.created",
      entityType: "requirement",
      entityId: created.id,
      metadata: { title: fields.title, source: fields.source },
    });

    return { id: created.id };
  });

// ------------- update -------------

const UpdateSchema = RequirementInputSchema.partial().extend({
  id: z.string().uuid(),
  skills: z.array(SkillSchema).max(80).optional(),
});

export const updateRequirement = createServerFn({ method: "POST" })
  .middleware([requireRequirementsAccess])
  .validator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { id, skills, ...fields } = data;

    // If assigning for the first time, stamp assigned_at and flip status.
    const patch: TablesUpdate<"requirements"> = { ...fields };
    if (fields.assigned_to !== undefined) {
      patch.assigned_at = fields.assigned_to ? new Date().toISOString() : null;
      if (fields.assigned_to && !fields.status) patch.status = "assigned";
    }

    const { error } = await supabase.from("requirements").update(patch).eq("id", id);
    if (error) throw new Error(error.message);

    if (skills) {
      const { error: dErr } = await supabase
        .from("requirement_skills")
        .delete()
        .eq("requirement_id", id);
      if (dErr) throw new Error(dErr.message);
      if (skills.length) {
        const { error: iErr } = await supabase
          .from("requirement_skills")
          .insert(skills.map((s) => ({ ...s, requirement_id: id })));
        if (iErr) throw new Error(iErr.message);
      }
    }

    const { writeAudit } = await import("@/lib/audit.server");
    await writeAudit({
      actorId: userId,
      actorEmail: (claims.email as string | undefined) ?? null,
      action: "requirement.updated",
      entityType: "requirement",
      entityId: id,
      metadata: { fields: Object.keys(fields) },
    });

    return { ok: true };
  });

// ------------- delete -------------

export const deleteRequirement = createServerFn({ method: "POST" })
  .middleware([requireRequirementsAccess])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { error } = await supabase.from("requirements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    const { writeAudit } = await import("@/lib/audit.server");
    await writeAudit({
      actorId: userId,
      actorEmail: (claims.email as string | undefined) ?? null,
      action: "requirement.deleted",
      entityType: "requirement",
      entityId: data.id,
    });
    return { ok: true };
  });

// ------------- assign -------------

export const assignRequirement = createServerFn({ method: "POST" })
  .middleware([requireRequirementsAccess])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        assigned_to: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const patch: TablesUpdate<"requirements"> = {
      assigned_to: data.assigned_to,
      assigned_at: data.assigned_to ? new Date().toISOString() : null,
    };
    if (data.assigned_to) patch.status = "assigned";
    const { error } = await supabase.from("requirements").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    const { writeAudit } = await import("@/lib/audit.server");
    await writeAudit({
      actorId: userId,
      actorEmail: (claims.email as string | undefined) ?? null,
      action: data.assigned_to ? "requirement.assigned" : "requirement.unassigned",
      entityType: "requirement",
      entityId: data.id,
      metadata: { assigned_to: data.assigned_to },
    });
    return { ok: true };
  });

// ------------- set status -------------

export const setRequirementStatus = createServerFn({ method: "POST" })
  .middleware([requireRequirementsAccess])
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(STATUSES) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { error } = await supabase
      .from("requirements")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const { writeAudit } = await import("@/lib/audit.server");
    await writeAudit({
      actorId: userId,
      actorEmail: (claims.email as string | undefined) ?? null,
      action: `requirement.status.${data.status}`,
      entityType: "requirement",
      entityId: data.id,
    });
    return { ok: true };
  });

// ------------- clients / vendors / recruiters lookups -------------

export const listLookups = createServerFn({ method: "GET" })
  .middleware([requireRequirementsAccess])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [clients, vendors, recruiters] = await Promise.all([
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("vendors").select("id, name, contact_email, contact_phone").order("name"),
      supabase
        .from("profiles")
        .select("id, full_name, email, is_active")
        .eq("is_active", true)
        .order("full_name"),
    ]);
    return {
      clients: clients.data ?? [],
      vendors: vendors.data ?? [],
      recruiters: recruiters.data ?? [],
    };
  });

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireRequirementsAccess])
  .validator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(160),
        contact_name: z.string().trim().max(120).optional(),
        contact_email: z.string().trim().email().max(255).optional().or(z.literal("")),
        contact_phone: z.string().trim().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: created, error } = await supabase
      .from("clients")
      .insert({ ...data, contact_email: data.contact_email || null, created_by: userId })
      .select("id, name")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return created!;
  });

export const createVendor = createServerFn({ method: "POST" })
  .middleware([requireRequirementsAccess])
  .validator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(160),
        contact_name: z.string().trim().max(120).optional(),
        contact_email: z.string().trim().email().max(255).optional().or(z.literal("")),
        contact_phone: z.string().trim().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: created, error } = await supabase
      .from("vendors")
      .insert({ ...data, contact_email: data.contact_email || null, created_by: userId })
      .select("id, name")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return created!;
  });

// ------------- AI JD parser -------------

const ParseInputSchema = z
  .object({
    text: z.string().trim().min(20).max(60000).optional(),
    upload_id: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.text || value.upload_id),
    "Provide job-description text or file",
  );

const ParsedJobDescriptionSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    client_name: z.string().trim().max(160).nullable(),
    location: z.string().trim().max(160).nullable(),
    work_mode: z.enum(WORK_MODES).nullable(),
    visa_types: z
      .array(z.enum(["H1B", "GC", "USC", "OPT", "CPT", "TN", "L2", "EAD", "H4-EAD", "GC-EAD"]))
      .max(20),
    rate_min: z.number().nonnegative().nullable(),
    rate_max: z.number().nonnegative().nullable(),
    rate_type: z.enum(RATE_TYPES).nullable(),
    currency: z.string().trim().min(1).max(8),
    min_experience_years: z.number().int().min(0).max(60).nullable(),
    max_experience_years: z.number().int().min(0).max(60).nullable(),
    primary_technology: z.string().trim().max(120).nullable(),
    duration: z.string().trim().max(80).nullable(),
    description: z.string().trim().max(2000).nullable(),
    mandatory_skills: z.array(z.string().trim().min(1).max(80)).max(80),
    preferred_skills: z.array(z.string().trim().min(1).max(80)).max(80),
  })
  .strict()
  .refine(
    (value) => value.rate_min == null || value.rate_max == null || value.rate_max >= value.rate_min,
    {
      path: ["rate_max"],
      message: "Maximum rate cannot be below minimum rate",
    },
  )
  .refine(
    (value) =>
      value.min_experience_years == null ||
      value.max_experience_years == null ||
      value.max_experience_years >= value.min_experience_years,
    { path: ["max_experience_years"], message: "Invalid experience range" },
  );

const PARSE_SCHEMA_INSTRUCTION = `Return ONLY valid JSON matching:
{
  "title": string,
  "client_name": string | null,
  "location": string | null,
  "work_mode": "onsite" | "remote" | "hybrid" | null,
  "visa_types": string[],
  "rate_min": number | null,
  "rate_max": number | null,
  "rate_type": "hourly" | "annual" | "monthly" | null,
  "currency": string,
  "min_experience_years": number | null,
  "max_experience_years": number | null,
  "primary_technology": string | null,
  "duration": string | null,
  "description": string | null,
  "mandatory_skills": string[],
  "preferred_skills": string[]
}
Rules:
- visa_types values: H1B, GC, USC, OPT, CPT, TN, L2, EAD, H4-EAD, GC-EAD, or empty array.
- currency default "USD".
- Do NOT invent data. Use null / [] when unknown.
- description: 1-3 sentence summary.
- No prose outside JSON.`;

export const parseJobDescription = createServerFn({ method: "POST" })
  .middleware([requireRequirementsAccess])
  .validator((input: unknown) => ParseInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    let extractedText = data.text ?? null;
    let uploadedPdf: { bytes: Uint8Array; fileName: string } | null = null;

    if (data.upload_id) {
      const { data: authorized, error: authorizeError } = await context.supabase
        .rpc("authorize_resume_upload", { _upload_id: data.upload_id })
        .maybeSingle();
      if (authorizeError || !authorized) throw new Error("Document upload is invalid or expired");

      const { data: blob, error: downloadError } = await context.supabase.storage
        .from("resume-uploads")
        .download(authorized.staging_path);
      if (downloadError || !blob) throw new Error("Uploaded document could not be read");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.byteLength !== authorized.size_bytes) {
        await context.supabase.storage.from("resume-uploads").remove([authorized.staging_path]);
        throw new Error("Uploaded document size mismatch");
      }

      let processed: Awaited<ReturnType<typeof processDocumentInIsolatedWorker>>;
      try {
        processed = await processDocumentInIsolatedWorker({
          bytes,
          mimeType: authorized.mime_type,
        });
      } catch (error) {
        await context.supabase.storage.from("resume-uploads").remove([authorized.staging_path]);
        throw error;
      }
      if (authorized.mime_type === "application/pdf") {
        uploadedPdf = { bytes, fileName: authorized.file_name };
      } else {
        extractedText = processed.extracted_text;
      }
      await context.supabase.storage.from("resume-uploads").remove([authorized.staging_path]);
    }

    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: PARSE_SCHEMA_INSTRUCTION },
    ];
    if (extractedText) {
      userContent.push({
        type: "text",
        text: `BEGIN_UNTRUSTED_JOB_DESCRIPTION\n${extractedText}\nEND_UNTRUSTED_JOB_DESCRIPTION`,
      });
    }
    if (uploadedPdf) {
      userContent.push({
        type: "file",
        file: {
          filename: uploadedPdf.fileName,
          file_data: `data:application/pdf;base64,${Buffer.from(uploadedPdf.bytes).toString("base64")}`,
        },
      });
    }

    return runWithAiUsageGuard(context.supabase, context.userId, "requirement_parse", () =>
      requestStructuredAiOutput(
        {
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `${UNTRUSTED_DOCUMENT_SYSTEM_RULES}\nExtract explicit IT staffing requirement facts only. Return only the requested JSON object.`,
            },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
        },
        ParsedJobDescriptionSchema,
      ),
    );
  });
