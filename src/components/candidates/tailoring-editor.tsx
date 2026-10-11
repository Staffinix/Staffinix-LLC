import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateFactPreservingResume, rejectTailoredResume } from "@/lib/tailoring.functions";
import type { getCandidate } from "@/lib/candidates.functions";

type Candidate = Awaited<ReturnType<typeof getCandidate>>;
type Selection = {
  skill_ids: string[];
  employment_ids: string[];
  education_ids: string[];
  project_ids: string[];
  certification_ids: string[];
};

export function TailoringEditor({
  candidate,
  version,
  onSaved,
}: {
  candidate: Candidate;
  version: Candidate["versions"][number];
  onSaved: (id: string) => void;
}) {
  const evidence = version.claim_validation as { selection?: Selection } | null;
  const [selection, setSelection] = useState<Selection>(
    evidence?.selection ?? {
      skill_ids: [],
      employment_ids: [],
      education_ids: [],
      project_ids: [],
      certification_ids: [],
    },
  );
  const queryClient = useQueryClient();
  const save = useServerFn(generateFactPreservingResume);
  const reject = useServerFn(rejectTailoredResume);
  const saveMutation = useMutation({
    mutationFn: (section?: keyof Selection) =>
      save({
        data: {
          candidate_id: candidate.id,
          requirement_id: version.requirement_id!,
          selection,
          expected_source_hash: version.source_hash!,
          source_resume_id: version.source_resume_id ?? undefined,
          regenerate_section: section,
        },
      }),
    onSuccess: async (draft) => {
      await queryClient.invalidateQueries({ queryKey: ["candidate", candidate.id] });
      onSaved(draft.id);
      toast.success("New immutable draft saved. Review before approving.");
    },
    onError: () =>
      toast.error("Draft could not be saved. Verify the source is current and try again."),
  });
  const rejectMutation = useMutation({
    mutationFn: () => reject({ data: { version_id: version.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["candidate", candidate.id] });
      onSaved(version.id);
      toast.success("Draft rejected");
    },
    onError: () => toast.error("Draft could not be rejected."),
  });
  const groups: Array<{
    key: keyof Selection;
    label: string;
    records: Array<{ id: string; label: string }>;
  }> = [
    {
      key: "skill_ids",
      label: "Technical skills",
      records: candidate.skills.map((item) => ({ id: item.id, label: item.skill })),
    },
    {
      key: "employment_ids",
      label: "Employment",
      records: candidate.employment.map((item) => ({
        id: item.id,
        label: `${item.title} · ${item.company}`,
      })),
    },
    {
      key: "education_ids",
      label: "Education",
      records: candidate.education.map((item) => ({
        id: item.id,
        label: `${item.degree} · ${item.institution}`,
      })),
    },
    {
      key: "project_ids",
      label: "Projects",
      records: candidate.projects.map((item) => ({ id: item.id, label: item.name })),
    },
    {
      key: "certification_ids",
      label: "Certifications",
      records: candidate.certifications.map((item) => ({ id: item.id, label: item.name })),
    },
  ];
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Edit fact selection / duplicate or restore as a new draft
      </summary>
      <p className="my-3 text-xs text-muted-foreground">
        Include or omit verified records. Uncheck and recheck to move an item to the end. Summary
        and dates remain verbatim. Saving always creates a new version; originals and earlier
        approvals are unchanged.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <fieldset key={group.key} className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{group.label}</legend>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saveMutation.isPending || !version.source_hash}
              onClick={() => saveMutation.mutate(group.key)}
            >
              Regenerate section
            </Button>
            {group.records.map((record) => (
              <label key={record.id} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selection[group.key].includes(record.id)}
                  onChange={(event) =>
                    setSelection((previous) => ({
                      ...previous,
                      [group.key]: event.target.checked
                        ? [...previous[group.key], record.id]
                        : previous[group.key].filter((id) => id !== record.id),
                    }))
                  }
                />
                {record.label}
              </label>
            ))}
            {!group.records.length && (
              <p className="text-xs text-muted-foreground">No verified records available.</p>
            )}
          </fieldset>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={!version.source_hash || !version.requirement_id || saveMutation.isPending}
          onClick={() => saveMutation.mutate(undefined)}
        >
          {saveMutation.isPending ? "Saving…" : "Save as new draft"}
        </Button>
        <Button
          variant="outline"
          disabled={version.status !== "draft" || rejectMutation.isPending}
          onClick={() => {
            if (window.confirm("Reject this draft? Its history will be retained."))
              rejectMutation.mutate();
          }}
        >
          Reject draft
        </Button>
      </div>
    </details>
  );
}
