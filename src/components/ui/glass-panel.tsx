import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const glassPanelVariants = cva("relative overflow-hidden rounded-2xl", {
  variants: {
    strength: {
      subtle: "glass",
      strong: "glass-strong",
      solid: "surface-panel",
    },
    padding: {
      none: "",
      sm: "p-3",
      md: "p-4 md:p-5",
      lg: "p-5 md:p-7",
    },
  },
  defaultVariants: {
    strength: "subtle",
    padding: "md",
  },
});

export interface GlassPanelProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof glassPanelVariants> {}

const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, strength, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(glassPanelVariants({ strength, padding }), className)}
      {...props}
    />
  ),
);
GlassPanel.displayName = "GlassPanel";

export { GlassPanel };
