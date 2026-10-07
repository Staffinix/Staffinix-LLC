import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Plus, Copy, Webhook, Terminal } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getDeveloperConfig,
  createApiKey,
  revokeApiKey,
  updateWorkflowSettings,
} from "@/lib/developer.functions";

import { AppTopbar } from "@/components/app-shell/topbar";

export const Route = createFileRoute("/_authenticated/developer")({
  head: () => ({
    meta: [
      { title: "Developer Console — Staffinix" },
      {
        name: "description",
        content: "Level 3 developer console: API keys, webhooks and automation configuration.",
      },
      { property: "og:title", content: "Developer Console — Staffinix" },
      {
        property: "og:description",
        content: "Issue API keys, configure webhooks and tune AI automation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DeveloperConsole,
});

function DeveloperConsole() {
  const fn = useServerFn(getDeveloperConfig);
  const { data, isLoading } = useQuery({
    queryKey: ["developer", "config"],
    queryFn: () => fn(),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <AppTopbar title="Developer Console & APIs" />
        <div className="p-8 text-sm text-muted-foreground flex-1">Loading developer config…</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppTopbar title="Developer Console & APIs" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <PageHeader
          title="Developer Console"
          description="Level 3 — API access, webhooks and workflow automation"
          actions={<NewKeyDialog />}
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" /> API keys
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.keys ?? []).length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No API keys yet. Create one to integrate Staffinix with your systems.
                    </TableCell>
                  </TableRow>
                )}
                {(data?.keys ?? []).map((k) => (
                  <TableRow key={k.id} className={k.revoked_at ? "opacity-50" : ""}>
                    <TableCell className="font-medium text-foreground">{k.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {k.key_prefix}••••••••
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {k.scopes.map((s: string) => (
                          <Badge key={s} variant="secondary" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {k.expires_at ? new Date(k.expires_at).toLocaleDateString() : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      {k.revoked_at ? (
                        <Badge variant="outline">Revoked</Badge>
                      ) : (
                        <RevokeButton id={k.id} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <WorkflowCard settings={data?.settings ?? null} />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Terminal className="h-4 w-4" /> Quickstart
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Authenticate every request with your API key. Keys are tenant-scoped — they can only
                read and write data belonging to your company.
              </p>
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-foreground">
                {`curl -X GET \\
  "https://api.staffinix.app/v1/requirements" \\
  -H "Authorization: Bearer sfx_••••••••" \\
  -H "Content-Type: application/json"`}
              </pre>
              <Separator />
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>
                  • <span className="text-foreground">read</span> — requirements, candidates,
                  submissions
                </li>
                <li>
                  • <span className="text-foreground">write</span> — create and update records
                </li>
                <li>
                  • <span className="text-foreground">admin</span> — manage users, workflow config
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function RevokeButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(revokeApiKey);
  const m = useMutation({
    mutationFn: () => fn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer", "config"] });
      toast.success("Key revoked");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-destructive"
      onClick={() => m.mutate()}
      disabled={m.isPending}
    >
      Revoke
    </Button>
  );
}

function NewKeyDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<("read" | "write" | "admin")[]>(["read"]);
  const [secret, setSecret] = useState<string | null>(null);

  const qc = useQueryClient();
  const fn = useServerFn(createApiKey);
  const create = useMutation({
    mutationFn: () => fn({ data: { name, scopes } }),
    onSuccess: (res) => {
      setSecret(res.secret);
      toast.success("API key created successfully");
      qc.invalidateQueries({ queryKey: ["developer", "config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setSecret(null);
          setName("");
          setScopes(["read"]);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New API key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{secret ? "Copy your API key" : "Create API key"}</DialogTitle>
        </DialogHeader>

        {secret ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This secret is shown once and stored only as a hash. Copy it now.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={secret} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(secret);
                  toast.success("Copied");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Key name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ATS sync integration"
              />
            </div>
            <div className="space-y-2">
              <Label>Scopes</Label>
              {(["read", "write", "admin"] as const).map((s) => (
                <div
                  key={s}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <span className="text-sm capitalize">{s}</span>
                  <Switch
                    checked={scopes.includes(s)}
                    onCheckedChange={(on) =>
                      setScopes((prev) =>
                        on ? [...new Set([...prev, s])] : prev.filter((x) => x !== s),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {secret ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || name.length < 2 || !scopes.length}
            >
              {create.isPending ? "Creating…" : "Create key"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Settings = {
  auto_parse_resumes: boolean;
  auto_match_on_requirement: boolean;
  auto_draft_submission_email: boolean;
  interview_reminders: boolean;
  match_score_threshold: number;
  webhook_url: string | null;
} | null;

function WorkflowCard({ settings }: { settings: Settings }) {
  const [state, setState] = useState({
    auto_parse_resumes: true,
    auto_match_on_requirement: true,
    auto_draft_submission_email: true,
    interview_reminders: true,
    match_score_threshold: 70,
    webhook_url: "",
  });

  useEffect(() => {
    if (settings) {
      setState({
        auto_parse_resumes: settings.auto_parse_resumes,
        auto_match_on_requirement: settings.auto_match_on_requirement,
        auto_draft_submission_email: settings.auto_draft_submission_email,
        interview_reminders: settings.interview_reminders,
        match_score_threshold: settings.match_score_threshold,
        webhook_url: settings.webhook_url ?? "",
      });
    }
  }, [settings]);

  const qc = useQueryClient();
  const fn = useServerFn(updateWorkflowSettings);
  const save = useMutation({
    mutationFn: () => fn({ data: { ...state, webhook_url: state.webhook_url || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer", "config"] });
      toast.success("Automation settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggles = [
    ["auto_parse_resumes", "Auto-parse resumes on upload"],
    ["auto_match_on_requirement", "Auto-run AI matching on new requirements"],
    ["auto_draft_submission_email", "Auto-draft submission emails"],
    ["interview_reminders", "Interview reminders"],
  ] as const;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Webhook className="h-4 w-4" /> Automation & webhooks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {toggles.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-sm text-foreground">{label}</span>
            <Switch
              checked={state[key]}
              onCheckedChange={(v) => setState((s) => ({ ...s, [key]: v }))}
            />
          </div>
        ))}

        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <Label>Auto-shortlist match threshold</Label>
            <span className="tabular-nums text-sm text-foreground">
              {state.match_score_threshold}%
            </span>
          </div>
          <Slider
            value={[state.match_score_threshold]}
            min={0}
            max={100}
            step={5}
            onValueChange={([v]) => setState((s) => ({ ...s, match_score_threshold: v }))}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Outbound webhook URL</Label>
          <Input
            value={state.webhook_url}
            placeholder="https://example.com/hooks/staffinix"
            onChange={(e) => setState((s) => ({ ...s, webhook_url: e.target.value }))}
          />
        </div>

        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save configuration"}
        </Button>
      </CardContent>
    </Card>
  );
}
