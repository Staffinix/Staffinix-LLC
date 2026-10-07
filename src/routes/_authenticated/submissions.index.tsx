import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/submissions/")({
  beforeLoad: () => {
    throw redirect({ to: "/submissions/board", replace: true });
  },
  component: () => null,
});
