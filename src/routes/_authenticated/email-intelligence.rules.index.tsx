import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteEmailRule, listEmailRules } from "@/lib/email-intelligence.functions";

export const Route = createFileRoute("/_authenticated/email-intelligence/rules/")({
  component: EmailRulesPage,
});
function EmailRulesPage() {
  const listFn = useServerFn(listEmailRules);
  const deleteFn = useServerFn(deleteEmailRule);
  const client = useQueryClient();
  const rules = useQuery({
    queryKey: ["email-rules"],
    queryFn: () => listFn(),
    retry: false,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Rule deleted.");
      void client.invalidateQueries({ queryKey: ["email-rules"] });
    },
    onError: () => toast.error("Unable to delete rule"),
  });
  return (
    <>
      <AppTopbar title="Smart Email Rules" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <PageHeader
          title="Filter Rules"
          description="Combine deterministic sender, subject, keyword, and attachment checks. AI is an optional final stage."
          actions={
            <Button size="sm" asChild>
              <Link to="/email-intelligence/rules/new">
                <Plus className="mr-1.5 size-4" />
                New rule
              </Link>
            </Button>
          }
        />
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Minimum score</TableHead>
                  <TableHead>AI</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.isPending && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <LoaderCircle className="size-4 animate-spin" />
                        Loading rules…
                      </span>
                    </TableCell>
                  </TableRow>
                )}
                {rules.isError && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-destructive">
                      <span className="inline-flex items-center gap-2">
                        <TriangleAlert className="size-4" />
                        Rules could not be loaded. Try again after the database is available.
                      </span>
                    </TableCell>
                  </TableRow>
                )}
                {(rules.data ?? []).map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell className="uppercase">{rule.match_mode}</TableCell>
                    <TableCell>{Math.round(rule.minimum_relevance_score * 100)}%</TableCell>
                    <TableCell>{rule.ai_enabled ? rule.ai_category || "Enabled" : "Off"}</TableCell>
                    <TableCell>
                      <Badge variant={rule.enabled ? "default" : "secondary"}>
                        {rule.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" asChild>
                          <Link to="/email-intelligence/rules/$id" params={{ id: rule.id }}>
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => remove.mutate(rule.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!rules.isPending && !rules.isError && (rules.data?.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No rules yet. Create one after connecting an account.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
