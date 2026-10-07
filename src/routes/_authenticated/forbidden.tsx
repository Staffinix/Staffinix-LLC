import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldX } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useProfile } from "@/hooks/use-profile";
import { getDefaultAuthorizedPath } from "@/lib/feature-access";

export const Route = createFileRoute("/_authenticated/forbidden")({
  component: ForbiddenPage,
});

function ForbiddenPage() {
  const { data } = useProfile();
  const destination = getDefaultAuthorizedPath({
    roles: data?.roles ?? [],
    platformRole: data?.platformRole ?? null,
  });

  return (
    <div className="space-y-6 p-8">
      <PageHeader
        title="Access denied"
        description="Your signed-in account does not have permission to use this feature."
      />
      <Card className="max-w-xl">
        <CardContent className="flex flex-col items-start gap-4 py-8">
          <div className="rounded-full bg-destructive/10 p-3 text-destructive">
            <ShieldX className="h-6 w-6" />
          </div>
          <div>
            <p className="font-medium">Assigned role: {data?.roleTitle ?? "Pending assignment"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask your company administrator to change your role if this feature is required for
              your work.
            </p>
          </div>
          <Button asChild>
            <Link to={destination}>Return to my workspace</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
