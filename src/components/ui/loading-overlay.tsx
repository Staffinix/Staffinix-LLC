import { LoaderCircle } from "lucide-react";

import { GlassPanel } from "@/components/ui/glass-panel";

export function LoadingOverlay({ label = "Loading workspace…" }: { label?: string }) {
  return (
    <div
      className="app-ambient flex min-h-screen items-center justify-center p-6"
      aria-live="polite"
      aria-busy="true"
    >
      <GlassPanel strength="strong" className="flex min-w-56 items-center gap-3" role="status">
        <span className="relative grid size-9 place-items-center rounded-full bg-primary/12 text-primary">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Staffinix</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
        </div>
      </GlassPanel>
    </div>
  );
}
