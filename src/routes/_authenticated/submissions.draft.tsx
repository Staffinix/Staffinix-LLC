import { createFileRoute, redirect } from "@tanstack/react-router";

type DraftSearch = { reqId?: string; candidateId?: string; tab?: string };

export const Route = createFileRoute("/_authenticated/submissions/draft")({
  validateSearch: (search: Record<string, unknown>): DraftSearch => ({
    reqId: (search.reqId as string) || undefined,
    candidateId: (search.candidateId as string) || undefined,
    tab: (search.tab as string) || "email",
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/tailoring",
      search: {
        reqId: search.reqId,
        candidateId: search.candidateId,
        tab: "email",
      },
      replace: true,
    });
  },
  component: () => null,
});
