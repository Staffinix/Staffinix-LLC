import { cn } from "@/lib/utils";
import logoSrc from "@/assets/logo.png";

/**
 * Staffinix brand mark. Uses the official Staffinix logo from src/assets/logo.png.
 */
export function StaffinixLogo({
  className,
  showWordmark = true,
  size = 28,
}: {
  className?: string;
  showWordmark?: boolean;
  size?: number;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <img
        src={logoSrc}
        alt="Staffinix logo"
        style={{ height: size, width: "auto" }}
        className="shrink-0 object-contain"
        draggable={false}
      />
      {showWordmark && <span className="text-base font-medium text-foreground">Staffinix AI</span>}
    </div>
  );
}
