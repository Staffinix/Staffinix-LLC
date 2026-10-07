import type { ReactNode } from "react";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export function PhasePlaceholder({
  topbar,
  title,
  phase,
  description,
  bullets,
  icon,
}: {
  topbar: string;
  title: string;
  phase: string;
  description: string;
  bullets: string[];
  icon?: ReactNode;
}) {
  return (
    <>
      <AppTopbar title={topbar} />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <PageHeader title={title} description={description} />
        <Card className="max-w-3xl border-dashed border-border bg-card">
          <CardContent className="p-8">
            <div className="flex items-start gap-4">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                {icon ?? <Sparkles className="h-5 w-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">
                    {phase}
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    Shipping in the next build phase
                  </p>
                </div>
                <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  {bullets.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
