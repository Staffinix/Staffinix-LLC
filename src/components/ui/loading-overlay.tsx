import { LoaderCircle } from "lucide-react";

export function LoadingOverlay({ label = "Loading workspace…" }: { label?: string }) {
  return (
    <div
      className="app-ambient flex min-h-screen items-center justify-center p-6"
      aria-live="polite"
      aria-busy="true"
    >
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}
