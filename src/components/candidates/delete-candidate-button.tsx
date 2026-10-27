import { useNavigate } from "@tanstack/react-router";
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
import { deleteCandidate } from "@/lib/candidates.functions";

export function DeleteCandidateButton({
  candidateId,
  name,
}: {
  candidateId: string;
  name: string;
}) {
  const { level } = useRoleLevel();
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const navigate = useNavigate();
  const remove = useServerFn(deleteCandidate);
  const mutation = useMutation({
    mutationFn: () => remove({ data: { id: candidateId } }),
    onSuccess: async (result) => {
      setOpen(false);
      if (result.cleanupPending)
        toast.warning("Candidate deleted. Resume file cleanup is pending.");
      else toast.success("Candidate deleted");
      client.removeQueries({ queryKey: ["candidate", candidateId] });
      await client.invalidateQueries();
      await navigate({ to: "/candidates" });
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
        <Button type="button" variant="destructive" size="sm">
          Delete candidate
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete candidate permanently?</AlertDialogTitle>
          <AlertDialogDescription>
            Permanently delete {name}, including their original resumes, tailored versions,
            submissions, placements, and profile details? This cannot be undone.
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
            {mutation.isPending ? "Deleting..." : "Delete candidate"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
