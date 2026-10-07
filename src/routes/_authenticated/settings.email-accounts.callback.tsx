import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { completeEmailOAuth } from "@/lib/email-intelligence.functions";

const SearchSchema = z.object({
  provider: z.enum(["gmail", "microsoft"]).catch("gmail"),
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/settings/email-accounts/callback")({
  validateSearch: (search) => SearchSchema.parse(search),
  component: EmailOAuthCallback,
});

function EmailOAuthCallback() {
  const search = Route.useSearch();
  const complete = useServerFn(completeEmailOAuth);
  const navigate = useNavigate();
  const started = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (search.error || !search.code || !search.state) {
      setFailure("The provider did not complete authorization.");
      return;
    }
    void complete({ data: { provider: search.provider, code: search.code, state: search.state } })
      .then(() => navigate({ to: "/settings/email-accounts", replace: true }))
      .catch(() => setFailure("Email authorization could not be completed. Please reconnect."));
  }, [complete, navigate, search]);
  if (failure)
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Connection failed</h1>
          <p className="mt-2 text-sm text-muted-foreground">{failure}</p>
        </div>
      </div>
    );
  return <LoadingOverlay label="Securing your email connection…" />;
}
