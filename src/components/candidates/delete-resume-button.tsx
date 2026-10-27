import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useRoleLevel } from "@/hooks/use-role-level";
import { deleteCandidateResume } from "@/lib/candidates.functions";

export function DeleteResumeButton({
  candidateId,
  resumeId,
  fileName,
}: {
  candidateId: string;
  resumeId: string;
  fileName: string;
}) {
  const { level } = useRoleLevel();
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const remove = useServerFn(deleteCandidateResume);
  const mutation = useMutation({
    mutationFn: () => remove({ data: { candidate_id: candidateId, resume_id: resumeId } }),
    onSuccess: async (result) => {
      setOpen(false);
      if (result.cleanupPending)
        toast.warning("Resume removed from the profile. Stored file cleanup is pending.");
      else toast.success("Resume deleted");
      await client.invalidateQueries({ queryKey: ["candidate", candidateId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (level !== "L1" && level !== "L2") return null;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Delete resume
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete original resume?</AlertDialogTitle>
          <AlertDialogDescription>
            Delete {fileName}? Candidate details will remain. This cannot be undone. Originals used
            by tailored versions must be retained.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Deleting..." : "Delete resume"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
