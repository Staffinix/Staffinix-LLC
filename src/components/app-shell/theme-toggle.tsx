import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggle } = useTheme();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={className}
      aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
    >
      {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
