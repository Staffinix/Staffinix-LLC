import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import type { ReactNode } from "react";
import { FlaskConical, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  listEmailAccounts,
  saveEmailRule,
  testEmailRule,
  type EmailRuleInput,
} from "@/lib/email-intelligence.functions";

type RuleValues = EmailRuleInput;

const splitList = (value: string): string[] =>
  value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
const joinList = (value: string[]): string => value.join(", ");

export function EmailRuleForm({ initial }: { initial?: Partial<RuleValues> }) {
  const navigate = useNavigate();
  const accountsFn = useServerFn(listEmailAccounts);
  const saveFn = useServerFn(saveEmailRule);
  const testFn = useServerFn(testEmailRule);
  const accounts = useQuery({ queryKey: ["email-accounts"], queryFn: () => accountsFn() });
  const [values, setValues] = useState<RuleValues>({
    id: initial?.id,
    email_account_id: initial?.email_account_id ?? "",
    name: initial?.name ?? "",
    enabled: initial?.enabled ?? true,
    match_mode: initial?.match_mode ?? "and",
    sender_emails: initial?.sender_emails ?? [],
    sender_domains: initial?.sender_domains ?? [],
    subject_keywords: initial?.subject_keywords ?? [],
    subject_exact: initial?.subject_exact ?? null,
    body_keywords: initial?.body_keywords ?? [],
    required_keywords: initial?.required_keywords ?? [],
    excluded_keywords: initial?.excluded_keywords ?? [],
    require_attachment: initial?.require_attachment ?? false,
    allowed_attachment_types: initial?.allowed_attachment_types ?? [],
    ai_enabled: initial?.ai_enabled ?? false,
    ai_category: initial?.ai_category ?? null,
    ai_prompt: initial?.ai_prompt ?? null,
    minimum_relevance_score: initial?.minimum_relevance_score ?? 0.7,
  });
  const [sample, setSample] = useState({
    from_email: "jobs@example.com",
    subject: "New application",
    body: "Candidate resume attached",
    attachment_names: ["resume.pdf"],
  });
  const save = useMutation({
    mutationFn: () => saveFn({ data: values }),
    onSuccess: () => {
      toast.success("Filter rule saved.");
      void navigate({ to: "/email-intelligence/rules" });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to save rule"),
  });
  const testRule = useMutation({
    mutationFn: () => testFn({ data: { rule: values, email: sample } }),
    onSuccess: (result) =>
      toast[result.relevant ? "success" : "error"](
        `${result.relevant ? "Matched" : "Not matched"} · ${Math.round(result.score * 100)}% · ${result.reasons.join("; ") || "No conditions matched"}`,
      ),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to test rule"),
  });
  const update = <K extends keyof RuleValues>(key: K, value: RuleValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card>
        <CardHeader>
          <CardTitle>Rule criteria</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <Field label="Rule name">
            <Input
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="Job applications"
            />
          </Field>
          <Field label="Email account">
            <Select
              value={values.email_account_id}
              onValueChange={(value) => update("email_account_id", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose an account" />
              </SelectTrigger>
              <SelectContent>
                {(accounts.data ?? []).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.email_address} · {account.provider}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Match mode">
            <Select
              value={values.match_mode}
              onValueChange={(value) => update("match_mode", value as "and" | "or")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="and">All configured groups (AND)</SelectItem>
                <SelectItem value="or">Any configured group (OR)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Minimum relevance">
            <Input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={values.minimum_relevance_score}
              onChange={(event) => update("minimum_relevance_score", Number(event.target.value))}
            />
          </Field>
          <ListField
            label="Sender emails"
            value={values.sender_emails}
            onChange={(value) => update("sender_emails", value)}
            placeholder="jobs@example.com"
          />
          <ListField
            label="Sender domains"
            value={values.sender_domains}
            onChange={(value) => update("sender_domains", value)}
            placeholder="linkedin.com"
          />
          <ListField
            label="Subject contains"
            value={values.subject_keywords}
            onChange={(value) => update("subject_keywords", value)}
            placeholder="application, candidate"
          />
          <Field label="Subject exact match">
            <Input
              value={values.subject_exact ?? ""}
              onChange={(event) => update("subject_exact", event.target.value || null)}
            />
          </Field>
          <ListField
            label="Body keywords"
            value={values.body_keywords}
            onChange={(value) => update("body_keywords", value)}
            placeholder="resume, interview"
          />
          <ListField
            label="Required keywords"
            value={values.required_keywords}
            onChange={(value) => update("required_keywords", value)}
            placeholder="candidate"
          />
          <ListField
            label="Excluded keywords"
            value={values.excluded_keywords}
            onChange={(value) => update("excluded_keywords", value)}
            placeholder="newsletter, unsubscribe"
          />
          <ListField
            label="Allowed attachment types"
            value={values.allowed_attachment_types}
            onChange={(value) => update("allowed_attachment_types", value)}
            placeholder="pdf, docx"
          />
          <Toggle
            label="Must have an attachment"
            checked={values.require_attachment}
            onCheckedChange={(value) => update("require_attachment", value)}
          />
          <Toggle
            label="Rule enabled"
            checked={values.enabled}
            onCheckedChange={(value) => update("enabled", value)}
          />
          <Toggle
            label="Use AI as final check"
            checked={values.ai_enabled}
            onCheckedChange={(value) => update("ai_enabled", value)}
          />
          <div />
          {values.ai_enabled && (
            <>
              <Field label="AI category">
                <Input
                  value={values.ai_category ?? ""}
                  onChange={(event) => update("ai_category", event.target.value || null)}
                  placeholder="job_application"
                />
              </Field>
              <Field label="AI criteria">
                <Textarea
                  value={values.ai_prompt ?? ""}
                  onChange={(event) => update("ai_prompt", event.target.value || null)}
                  placeholder="Relevant recruitment applications with a real candidate profile"
                />
              </Field>
            </>
          )}
          <div className="flex gap-2 md:col-span-2">
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || !values.email_account_id}
            >
              <Save className="mr-1.5 size-4" />
              Save rule
            </Button>
            <Button
              variant="outline"
              onClick={() => testRule.mutate()}
              disabled={testRule.isPending || !values.email_account_id}
            >
              <FlaskConical className="mr-1.5 size-4" />
              Test sample
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Test email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="From">
            <Input
              type="email"
              value={sample.from_email}
              onChange={(event) =>
                setSample((current) => ({ ...current, from_email: event.target.value }))
              }
            />
          </Field>
          <Field label="Subject">
            <Input
              value={sample.subject}
              onChange={(event) =>
                setSample((current) => ({ ...current, subject: event.target.value }))
              }
            />
          </Field>
          <Field label="Body">
            <Textarea
              rows={7}
              value={sample.body}
              onChange={(event) =>
                setSample((current) => ({ ...current, body: event.target.value }))
              }
            />
          </Field>
          <Field label="Attachment names">
            <Input
              value={joinList(sample.attachment_names)}
              onChange={(event) =>
                setSample((current) => ({
                  ...current,
                  attachment_names: splitList(event.target.value),
                }))
              }
            />
          </Field>
          <p className="text-xs leading-5 text-muted-foreground">
            Testing does not save the sample email. AI content is sent only when this rule
            explicitly enables AI.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function ListField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <Input
        value={joinList(value)}
        onChange={(event) => onChange(splitList(event.target.value))}
        placeholder={placeholder}
      />
    </Field>
  );
}
function Toggle({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border p-3">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
