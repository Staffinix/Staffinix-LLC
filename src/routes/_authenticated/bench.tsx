import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/bench")({
  beforeLoad: () => {
    throw redirect({ to: "/candidates", replace: true });
  },
  component: () => null,
});
