import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABEL,
  INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABEL,
  pipelineStage,
  type PipelineStageChange,
} from "@/lib/pipeline-stages";

type InterviewType = (typeof INTERVIEW_TYPES)[number];

export function SubmissionStageSelect({
  stage,
  interviewType,
  interviewOther,
  disabled,
  onChange,
}: {
  stage: string;
  interviewType: string | null;
  interviewOther: string | null;
  disabled: boolean;
  onChange: (change: Omit<PipelineStageChange, "id">) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<InterviewType | "">("");
  const [other, setOther] = useState("");
  const openInterview = () => {
    setType(
      INTERVIEW_TYPES.includes(interviewType as InterviewType)
        ? (interviewType as InterviewType)
        : "",
    );
    setOther(interviewOther ?? "");
    setOpen(true);
  };
  async function saveInterview() {
    if (!type || (type === "other" && !other.trim())) return;
    try {
      await onChange({
        to_stage: "interview",
        interview_type: type,
        interview_other: type === "other" ? other.trim() : null,
      });
      setOpen(false);
    } catch {
      /* The caller displays the mutation error and preserves the form for retry. */
    }
  }
  return (
    <div className="space-y-1">
      <Select
        value={pipelineStage(stage)}
        disabled={disabled}
        onValueChange={(value) => {
          if (value === "interview") openInterview();
          else
            void onChange({ to_stage: value as PipelineStageChange["to_stage"] }).catch(() => {});
        }}
      >
        <SelectTrigger aria-label="Pipeline stage" className="h-8 w-44 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PIPELINE_STAGES.map((value) => (
            <SelectItem key={value} value={value}>
              {PIPELINE_STAGE_LABEL[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {stage === "interview" && (
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={openInterview}
          className="h-auto max-w-44 whitespace-normal px-1 py-1 text-xs"
        >
          {interviewType === "other"
            ? `Other: ${interviewOther ?? ""}`
            : INTERVIEW_TYPE_LABEL[interviewType as InterviewType] || "Select interview type"}
        </Button>
      )}
      <Dialog open={open} onOpenChange={(value) => !disabled && setOpen(value)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Interview type</DialogTitle>
            <DialogDescription>
              Choose the current interview round. Selecting Other lets you enter a custom type.
            </DialogDescription>
          </DialogHeader>
          <Select
            value={type}
            onValueChange={(value) => setType(value as InterviewType)}
            disabled={disabled}
          >
            <SelectTrigger aria-label="Interview type">
              <SelectValue placeholder="Select interview type" />
            </SelectTrigger>
            <SelectContent>
              {INTERVIEW_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {INTERVIEW_TYPE_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {type === "other" && (
            <label className="space-y-2 text-sm">
              Other interview type
              <Input
                value={other}
                maxLength={120}
                disabled={disabled}
                onChange={(event) => setOther(event.target.value)}
                placeholder="Enter interview type"
              />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={disabled} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={disabled || !type || (type === "other" && !other.trim())}
              onClick={() => void saveInterview()}
            >
              {disabled ? "Saving…" : "Save interview stage"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
