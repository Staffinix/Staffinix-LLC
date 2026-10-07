import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  FileText,
  Sparkles,
  FileUp,
  ClipboardPaste,
  Wand2,
} from "lucide-react";
import { parseJobDescription, listLookups } from "@/lib/requirements.functions";
import { createDocumentUpload } from "@/lib/document-upload.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  RequirementForm,
  type RequirementFormValues,
} from "@/components/requirements/requirement-form";

export const Route = createFileRoute("/_authenticated/requirements/new")({
  head: () => ({ meta: [{ title: "New Requisition — Staffinix" }] }),
  component: NewRequirementPage,
});

function NewRequirementPage() {
  const navigate = useNavigate();
  const [initialValues] = useState<Partial<RequirementFormValues>>({});

  const lookupsFn = useServerFn(listLookups);
  const { data: lookups } = useQuery({ queryKey: ["req-lookups"], queryFn: () => lookupsFn() });

  return (
    <>
      <AppTopbar title="New Requisition" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/requirements">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Requisitions
            </Link>
          </Button>
        </div>
        <PageHeader
          title="New Requisition"
          description="Enter client requisition details, required primary & secondary skills, rate range, and visa requirements."
        />

        <div className="mt-4">
          <RequirementForm
            mode="create"
            initialValues={initialValues}
            source="manual"
            lookups={lookups}
            onSaved={(id) => navigate({ to: "/requirements" })}
            onCancel={() => navigate({ to: "/requirements" })}
          />
        </div>
      </main>
    </>
  );
}

function mapParsed(
  parsed: Awaited<ReturnType<typeof parseJobDescription>>,
): Partial<RequirementFormValues> {
  const skills = [
    ...(parsed.mandatory_skills ?? []).map((s) => ({ skill: s, is_mandatory: true })),
    ...(parsed.preferred_skills ?? []).map((s) => ({ skill: s, is_mandatory: false })),
  ];
  return {
    title: parsed.title ?? "",
    location: parsed.location ?? "",
    work_mode: parsed.work_mode ?? undefined,
    visa_types: parsed.visa_types ?? [],
    rate_min: parsed.rate_min ?? null,
    rate_max: parsed.rate_max ?? null,
    rate_type: parsed.rate_type ?? undefined,
    currency: parsed.currency ?? "USD",
    min_experience_years: parsed.min_experience_years ?? null,
    max_experience_years: parsed.max_experience_years ?? null,
    primary_technology: parsed.primary_technology ?? "",
    duration: parsed.duration ?? "",
    description: parsed.description ?? "",
    skills,
  };
}

function PasteJDCard({ onParsed }: { onParsed: (v: Partial<RequirementFormValues>) => void }) {
  const [text, setText] = useState("");
  const parseFn = useServerFn(parseJobDescription);
  const mutation = useMutation({
    mutationFn: () => parseFn({ data: { text } }),
    onSuccess: (p) => onParsed(mapParsed(p)),
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" /> Paste a job description
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder="Paste the entire JD here…"
          rows={14}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex justify-end">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || text.trim().length < 20}
          >
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            Extract fields with AI
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function UploadFileCard({
  kind,
  onParsed,
}: {
  kind: "pdf" | "docx";
  onParsed: (v: Partial<RequirementFormValues>) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const parseFn = useServerFn(parseJobDescription);
  const createUploadFn = useServerFn(createDocumentUpload);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file first");
      if (file.size < 1 || file.size > 10 * 1024 * 1024) {
        throw new Error("Document must be between 1 byte and 10 MiB");
      }
      const mimeType =
        kind === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const grant = await createUploadFn({
        data: { file_name: file.name, mime_type: mimeType, size_bytes: file.size },
      });
      const { error: uploadError } = await supabase.storage
        .from("resume-uploads")
        .uploadToSignedUrl(grant.path, grant.token, file, {
          contentType: mimeType,
        });
      if (uploadError) {
        throw new Error(`Document upload failed: ${uploadError.message}`);
      }
      return parseFn({ data: { upload_id: grant.upload_id } });
    },
    onSuccess: (p) => onParsed(mapParsed(p)),
    onError: (e) => toast.error((e as Error).message),
  });

  const accept = kind === "pdf" ? "application/pdf,.pdf" : ".docx";

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileUp className="h-4 w-4 text-primary" />
          Upload a {kind.toUpperCase()} JD
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>File</Label>
          <Input
            type="file"
            accept={accept}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <p className="text-xs text-muted-foreground">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !file}>
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            Extract fields with AI
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
