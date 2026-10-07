import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useProfile } from "@/hooks/use-profile";
import { getDefaultAuthorizedPath } from "@/lib/feature-access";

export const Route = createFileRoute("/_authenticated/overview")({
  component: OverviewRedirect,
});

function OverviewRedirect() {
  const { data } = useProfile();
  const navigate = useNavigate();

  useEffect(() => {
    if (!data) return;
    void navigate({
      to: getDefaultAuthorizedPath({ roles: data.roles, platformRole: data.platformRole }),
      replace: true,
    });
  }, [data, navigate]);

  return (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      Opening your workspace...
    </div>
  );
}
