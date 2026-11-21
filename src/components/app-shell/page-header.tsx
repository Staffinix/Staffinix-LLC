import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <h1 className="text-balance text-2xl font-medium tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>
      )}
    </div>
  );
}
