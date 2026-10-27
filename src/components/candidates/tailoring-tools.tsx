import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  attachCandidateResume,
  createCandidateResumeUpload,
  getCandidate,
} from "@/lib/candidates.functions";
import { evaluateCandidateMatch } from "@/features/ai-matching/candidate-match-engine";
import { getApprovedResumeExport } from "@/lib/tailoring.functions";
import {
  createResumeExport,
  RESUME_TEMPLATES,
  validateResumeExport,
  type ResumeTemplate,
} from "@/lib/resume-export";

type Candidate = Awaited<ReturnType<typeof getCandidate>>;
// The server response types keep this workspace aligned with the existing APIs.
import type { getRequirement as getJob } from "@/lib/requirements.functions";
type Requirement = Awaited<ReturnType<typeof getJob>>;

export function TailoringUpload({ candidateId }: { candidateId: string }) {
  const createUpload = useServerFn(createCandidateResumeUpload);
  const attach = useServerFn(attachCandidateResume);
  const queryClient = useQueryClient();
  const [stage, setStage] = useState("");
  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const extension = file.name.split(".").at(-1)?.toLowerCase();
      if (!file.size || file.size > 10 * 1024 * 1024 || !["pdf", "docx"].includes(extension ?? ""))
        throw new Error("Choose a PDF or DOCX up to 10 MiB.");
      const mime =
        extension === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      setStage("Preparing secure upload…");
      const grant = await createUpload({
        data: { file_name: file.name, mime_type: mime, size_bytes: file.size },
      });
      setStage("Uploading original resume…");
      const { error } = await supabase.storage
        .from("resume-uploads")
        .uploadToSignedUrl(grant.path, grant.token, file, { contentType: mime });
      if (error) throw new Error("Resume upload failed. Please try again.");
      setStage("Validating and parsing document…");
      await attach({ data: { candidate_id: candidateId, upload_id: grant.upload_id } });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      toast.success("Resume uploaded. Review the extracted text before verification.");
    },
    onError: () => toast.error("Resume could not be processed. Check its format or try again."),
    onSettled: () => setStage(""),
  });
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <label className="text-sm font-medium" htmlFor="tailoring-resume">
        Upload or replace original resume
      </label>
      <Input
        id="tailoring-resume"
        type="file"
        accept=".pdf,.docx"
        disabled={mutation.isPending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) mutation.mutate(file);
          event.target.value = "";
        }}
      />
      <p className="text-xs text-muted-foreground" role="status">
        {stage ||
          "PDF or DOCX, up to 10 MiB. One current original per candidate. Replacements require verification; prior sources remain in tailored history."}
      </p>
    </div>
  );
}

export function TailoringAnalysis({
  candidate,
  requirement,
}: {
  candidate: Candidate;
  requirement: Requirement;
}) {
  const analysis = useMemo(
    () =>
      evaluateCandidateMatch({
        candidate,
        requirement,
        requirementSkills: requirement.skills,
        evidence: {
          skills: candidate.skills,
          employment: candidate.employment,
          education: candidate.education,
          projects: candidate.projects,
          certifications: candidate.certifications,
          resumeText: candidate.resumes.find((resume) => resume.verification_status === "verified")
            ?.extracted_text,
        },
      }),
    [candidate, requirement],
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Resume match analysis · {analysis.overall}%</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>{analysis.summary}</p>
        <p className="text-xs text-muted-foreground">
          Evidence-weighted matching score, not an ATS guarantee. Missing facts require recruiter
          review.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <p>
            Supported required skills:{" "}
            {analysis.matched_required_skills.join(", ") || "None recorded"}
          </p>
          <p>
            Required skill gaps: {analysis.missing_required_skills.join(", ") || "None identified"}
          </p>
        </div>
        {analysis.factors.map((factor) => (
          <details key={factor.key}>
            <summary className="cursor-pointer">
              {factor.label}: {factor.score}% · weight {Math.round(factor.applied_weight * 100)}%
            </summary>
            <p className="text-muted-foreground">{factor.evidence.join(" · ")}</p>
          </details>
        ))}
        {[...analysis.hard_constraint_reasons, ...analysis.review_notes].map((note) => (
          <p key={note} className="text-muted-foreground">
            {note}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

export function ResumeComparison({
  original,
  tailored,
  originalLabel = "Original resume · unchanged",
}: {
  original: string;
  tailored: string;
  originalLabel?: string;
}) {
  const preview = (text: string) => (
    <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-xs leading-6">
      {text || "No text available."}
    </pre>
  );
  return (
    <>
      <div className="hidden gap-4 md:grid md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium">{originalLabel}</h3>
          {preview(original)}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">Tailored resume · proposed selection</h3>
          {preview(tailored)}
        </div>
      </div>
      <Tabs defaultValue="tailored" className="md:hidden">
        <TabsList>
          <TabsTrigger value="original">Original</TabsTrigger>
          <TabsTrigger value="tailored">Tailored</TabsTrigger>
        </TabsList>
        <TabsContent value="original">{preview(original)}</TabsContent>
        <TabsContent value="tailored">{preview(tailored)}</TabsContent>
      </Tabs>
    </>
  );
}

export function ResumeDownloads({ version }: { version: Candidate["versions"][number] }) {
  const exportResume = useServerFn(getApprovedResumeExport);
  const [template, setTemplate] = useState<ResumeTemplate>("classic");
  const [busy, setBusy] = useState(false);
  const download = async (format: "pdf" | "docx") => {
    setBusy(true);
    try {
      validateResumeExport(version);
      const { content } = await exportResume({
        data: { version_id: version.id, format, template },
      });
      const blob = await createResumeExport(content, template, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `resume-v${version.version_no}-${template}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error(
        "Export failed. Approve the version and retry. For non-Latin characters, use DOCX.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Resume template"
        value={template}
        onChange={(event) => setTemplate(event.target.value as ResumeTemplate)}
        className="rounded-md border bg-background p-2 text-sm"
      >
        {Object.entries(RESUME_TEMPLATES).map(([key, value]) => (
          <option key={key} value={key}>
            {value.label}
          </option>
        ))}
      </select>
      <Button
        variant="outline"
        disabled={busy || version.status !== "approved"}
        onClick={() => download("pdf")}
      >
        Export PDF
      </Button>
      <Button
        variant="outline"
        disabled={busy || version.status !== "approved"}
        onClick={() => download("docx")}
      >
        Export DOCX
      </Button>
      {busy && <span role="status">Exporting…</span>}
    </div>
  );
}
