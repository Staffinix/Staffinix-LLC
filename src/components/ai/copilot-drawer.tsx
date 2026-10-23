import { lazy, Suspense } from "react";
import { Bot, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const CopilotPanel = lazy(() =>
  import("./copilot-panel").then((module) => ({ default: module.CopilotPanel })),
);
export function CopilotDrawer({ children }: { children?: React.ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        {children || (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 border-primary/30 bg-primary/10 px-2.5 text-xs font-semibold text-primary shadow-sm transition-all hover:bg-primary/20"
            aria-label="Open AI Copilot"
          >
            <Bot className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">AI Copilot</span>
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border pb-3">
          <SheetTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </span>
            AI Copilot
            <Badge variant="outline" className="ml-auto text-[10px]">
              Grounded · read-only
            </Badge>
          </SheetTitle>
        </SheetHeader>
        <Suspense
          fallback={
            <p role="status" className="p-4 text-sm">
              Loading Copilot…
            </p>
          }
        >
          <CopilotPanel compact />
        </Suspense>
      </SheetContent>
    </Sheet>
  );
}
