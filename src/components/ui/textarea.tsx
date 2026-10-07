import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-24 w-full rounded-xl border border-input bg-background/55 px-3.5 py-2.5 text-base shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_4%,transparent)] backdrop-blur-sm transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-muted-foreground/80 hover:border-border-strong focus-visible:border-primary/45 focus-visible:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
