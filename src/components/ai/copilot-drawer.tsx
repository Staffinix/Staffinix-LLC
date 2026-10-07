import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, ExternalLink, Loader2, Send, Sparkles, Trash2, User } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  askCopilot,
  clearCopilotHistory,
  getCopilotRagStatus,
  listCopilotMessages,
  type CopilotMessage,
} from "@/lib/copilot.functions";

const WELCOME_MESSAGE: CopilotMessage = {
  id: "00000000-0000-4000-8000-000000000001",
  role: "assistant",
  content:
    "Hi — I'm the Staffinix Copilot. I extract and chunk authorized documents, retrieve relevant evidence with tenant-filtered Qdrant similarity search, and generate grounded answers with source links.",
  sources: [],
  created_at: "",
};

const QUICK_ACTIONS = [
  "Show available bench candidates",
  "Which requisitions need attention?",
  "Summarize pipeline bottlenecks",
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Copilot could not complete that request.";
}

export function CopilotPanel({ compact = false }: { compact?: boolean }) {
  const [messages, setMessages] = useState<CopilotMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [ragReady, setRagReady] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const askCopilotFn = useServerFn(askCopilot);
  const listMessagesFn = useServerFn(listCopilotMessages);
  const clearHistoryFn = useServerFn(clearCopilotHistory);
  const ragStatusFn = useServerFn(getCopilotRagStatus);

  useEffect(() => {
    let active = true;
    void ragStatusFn()
      .then((status) => {
        if (active) setRagReady(status.qdrant && status.ollama);
      })
      .catch(() => {
        if (active) setRagReady(false);
      });
    return () => {
      active = false;
    };
  }, [ragStatusFn]);

  useEffect(() => {
    let active = true;
    void listMessagesFn()
      .then((history) => {
        if (active) setMessages(history.length ? history : [WELCOME_MESSAGE]);
      })
      .catch((error) => {
        if (active) {
          setMessages([
            WELCOME_MESSAGE,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: errorMessage(error),
              sources: [],
              created_at: new Date().toISOString(),
            },
          ]);
        }
      })
      .finally(() => {
        if (active) setLoadingHistory(false);
      });
    return () => {
      active = false;
    };
  }, [listMessagesFn]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const value = text.trim();
    if (!value || loading) return;
    const optimisticUser: CopilotMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: value,
      sources: [],
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimisticUser]);
    setInput("");
    setLoading(true);
    try {
      const response = await askCopilotFn({ data: { question: value } });
      setMessages((current) => [...current, response]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: errorMessage(error),
          sources: [],
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function clearHistory() {
    setLoading(true);
    try {
      await clearHistoryFn();
      setMessages([WELCOME_MESSAGE]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: errorMessage(error),
          sources: [],
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        compact ? "h-full" : "min-h-[620px] rounded-lg border border-border bg-card px-5",
      )}
    >
      <div className="flex items-center justify-between border-b border-border py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              "inline-flex h-2 w-2 rounded-full",
              ragReady === null
                ? "bg-muted-foreground"
                : ragReady
                  ? "bg-emerald-500"
                  : "bg-amber-500",
            )}
          />
          {ragReady === null
            ? "Checking RAG services…"
            : ragReady
              ? "Qdrant RAG · tenant-grounded"
              : "RAG services offline · database fallback"}
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={loading || messages.length <= 1}
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear Copilot conversation?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes your Copilot messages for this workspace. Other users’
                conversations are unaffected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void clearHistory()}>
                Clear conversation
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1">
        {loadingHistory ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…
          </div>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={cn("flex gap-2.5", message.role === "user" && "flex-row-reverse")}
            >
              <div
                className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
                  message.role === "assistant"
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-surface-2 text-muted-foreground",
                )}
              >
                {message.role === "assistant" ? (
                  <Bot className="h-3.5 w-3.5" />
                ) : (
                  <User className="h-3.5 w-3.5" />
                )}
              </div>
              <div
                className={cn(
                  "min-w-0 max-w-[88%] rounded-2xl px-3.5 py-3",
                  message.role === "assistant"
                    ? "border border-border bg-surface"
                    : "bg-primary text-primary-foreground",
                )}
              >
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {renderMarkdown(message.content)}
                </div>
                {message.sources.length > 0 && (
                  <div className="mt-3 border-t border-border/70 pt-2.5">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Staffinix sources
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {message.sources.map((source) => (
                        <a
                          key={source.key}
                          href={source.path}
                          className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-primary hover:border-primary/40 hover:underline"
                        >
                          <span className="truncate">{source.label}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </article>
          ))
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting, embedding and retrieving
            authorized evidence…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="space-y-2 border-t border-border py-3">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => void send(action)}
              disabled={loading || loadingHistory}
              className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
            >
              {action}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
        >
          <Textarea
            aria-label="Ask AI Copilot"
            rows={2}
            value={input}
            maxLength={2_000}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask about candidates, reqs, interviews or pipeline…"
            className="min-h-[52px] resize-none"
          />
          <Button
            type="submit"
            size="icon"
            disabled={loading || loadingHistory || !input.trim()}
            aria-label="Send Copilot message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="text-[10px] text-muted-foreground">
          Enter to send · Shift + Enter for a new line · Qdrant retrieval is read-only and
          tenant-scoped
        </p>
      </div>
    </div>
  );
}

function renderMarkdown(text: string) {
  return text.split("\n").map((line, index) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={partIndex} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <span key={partIndex}>{part.replace(/_/g, " ")}</span>
      ),
    );
    if (line.startsWith("- ")) {
      return (
        <p key={index} className="flex gap-2">
          <span aria-hidden>•</span>
          <span>{parts.slice(1)}</span>
        </p>
      );
    }
    return (
      <p key={index} className={cn(line.trim() === "" && "h-2")}>
        {parts}
      </p>
    );
  });
}

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
        <CopilotPanel compact />
      </SheetContent>
    </Sheet>
  );
}
