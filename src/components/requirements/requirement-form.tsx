import { RequiredRequirementDetailsSchema } from "@/lib/requirement-form-validation";
import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  REQ_STATUSES,
  REQ_PRIORITIES,
  WORK_MODES,
  RATE_TYPES,
  VISA_OPTIONS,
  STATUS_LABEL,
  PRIORITY_LABEL,
  type RequirementStatus,
  type RequirementPriority,
  type WorkMode,
  type RateType,
} from "@/lib/requirements-constants";
import {
  createRequirement,
  searchRequirementVendors,
  updateRequirement,
  createClient as createClientFn,
  createVendor as createVendorFn,
} from "@/lib/requirements.functions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { UsRequisitionLocationSchema, UsRequisitionCurrencySchema } from "@/lib/us-requisition";

export type RequirementFormValues = {
  title: string;
  client_id: string | null;
  vendor_id: string | null;
  vendor_email: string;
  vendor_contact: string;
  location: string;
  work_mode?: WorkMode;
  visa_types: string[];
  rate_min: number | null;
  rate_max: number | null;
  rate_type?: RateType;
  currency: string;
  min_experience_years: number | null;
  max_experience_years: number | null;
  primary_technology: string;
  description: string;
  recruiter_notes: string;
  status: RequirementStatus;
  priority: RequirementPriority;
  duration: string;
  skills: { skill: string; is_mandatory: boolean }[];
};

const EMPTY: RequirementFormValues = {
  title: "",
  client_id: null,
  vendor_id: null,
  vendor_email: "",
  vendor_contact: "",
  location: "",
  work_mode: undefined,
  visa_types: [],
  rate_min: null,
  rate_max: null,
  rate_type: undefined,
  currency: "USD",
  min_experience_years: null,
  max_experience_years: null,
  primary_technology: "",
  description: "",
  recruiter_notes: "",
  status: "open",
  priority: "medium",
  duration: "",
  skills: [],
};

type Lookups = {
  clients: { id: string; name: string }[];
  vendors: {
    id: string;
    name: string;
    contact_email: string | null;
    contact_phone: string | null;
  }[];
  recruiters: { id: string; full_name: string | null; email: string; is_active: boolean }[];
};

export function RequirementForm({
  mode,
  requirementId,
  initialValues,
  source = "manual",
  lookups,
  onSaved,
  onCancel,
}: {
  mode: "create" | "edit";
  requirementId?: string;
  initialValues?: Partial<RequirementFormValues>;
  source?: "manual" | "paste" | "pdf" | "docx";
  lookups?: Lookups;
  onSaved: (id: string) => void;
  onCancel?: () => void;
}) {
  const qc = useQueryClient();
  const [v, setV] = useState<RequirementFormValues>(() => ({
    ...EMPTY,
    ...initialValues,
    visa_types: initialValues?.visa_types ?? [],
    skills: initialValues?.skills ?? [],
  }));

  const createFn = useServerFn(createRequirement);
  const updateFn = useServerFn(updateRequirement);
  const clientFn = useServerFn(createClientFn);
  const vendorFn = useServerFn(createVendorFn);

  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorPage, setVendorPage] = useState(1);
  const debouncedVendorSearch = useDebouncedValue(vendorSearch, 250);
  const searchVendorsFn = useServerFn(searchRequirementVendors);
  const vendorQuery = useQuery({
    queryKey: ["requirement-vendors", debouncedVendorSearch, vendorPage, v.vendor_id],
    queryFn: () =>
      searchVendorsFn({
        data: { search: debouncedVendorSearch, page: vendorPage, selectedId: v.vendor_id },
      }),
  });
  const vendorOptions = vendorQuery.data?.rows ?? [];
  const selectedVendor = vendorQuery.data?.selected;
  const visibleVendors =
    selectedVendor && !vendorOptions.some((item) => item.id === selectedVendor.id)
      ? [selectedVendor, ...vendorOptions]
      : vendorOptions;

  const [newSkill, setNewSkill] = useState("");
  const [newSkillMandatory, setNewSkillMandatory] = useState(true);

  const mutation = useMutation({
    mutationFn: async () => {
      const details = RequiredRequirementDetailsSchema.safeParse(v);
      if (!details.success) {
        throw new Error(details.error.issues.map((issue) => issue.message).join(". "));
      }
      const locationResult = UsRequisitionLocationSchema.safeParse(v.location);
      if (!locationResult.success)
        throw new Error("Enter a U.S. city and state (Dallas, TX), or Remote, USA.");
      if (!UsRequisitionCurrencySchema.safeParse(v.currency).success)
        throw new Error("Select USD and review the rate amounts before saving.");
      const payload = {
        ...v,
        source,
        title: v.title.trim(),
        location: v.location.trim(),
        primary_technology: emptyToNull(v.primary_technology),
        description: emptyToNull(v.description),
        recruiter_notes: emptyToNull(v.recruiter_notes),
        duration: emptyToNull(v.duration),
        currency: v.currency || "USD",
      };

      if (mode === "create") {
        const res = await createFn({ data: payload });
        if (!res?.id) throw new Error("Requirement creation returned no identifier");
        return res.id;
      }

      await updateFn({ data: { ...payload, id: requirementId! } });
      return requirementId!;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["requirements"] });
      qc.invalidateQueries({ queryKey: ["requirement", id] });
      toast.success(mode === "create" ? "Requirement created" : "Requirement updated");
      onSaved(id);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const addSkill = () => {
    const s = newSkill.trim();
    if (!s) return;
    if (v.skills.some((x) => x.skill.toLowerCase() === s.toLowerCase())) return;
    setV((prev) => ({
      ...prev,
      skills: [...prev.skills, { skill: s, is_mandatory: newSkillMandatory }],
    }));
    setNewSkill("");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.title.trim().length < 2) {
          toast.error("Title is required");
          return;
        }
        mutation.mutate();
      }}
      className="space-y-6"
    >
      <p className="text-xs text-muted-foreground">
        All fields are required except Rate min and Rate max.
      </p>
      <Card className="border-border bg-card">
        <CardContent className="grid gap-4 p-6 md:grid-cols-2">
          <Field label="Title" required className="md:col-span-2">
            <Input
              value={v.title}
              onChange={(e) => setV({ ...v, title: e.target.value })}
              placeholder="Senior Java Developer"
              required
            />
          </Field>

          <Field label="Client" required>
            <ComboEntity
              value={v.client_id}
              onChange={(id) => setV({ ...v, client_id: id })}
              options={lookups?.clients ?? []}
              placeholder="Select client"
              onCreate={async (name) => {
                const c = await clientFn({ data: { name } });
                qc.invalidateQueries({ queryKey: ["req-lookups"] });
                return c;
              }}
            />
          </Field>
          <Field label="Vendor Name" required>
            <Input
              aria-label="Search vendors"
              placeholder="Search vendors"
              value={vendorSearch}
              onChange={(event) => {
                setVendorSearch(event.target.value);
                setVendorPage(1);
              }}
            />
            <ComboEntity
              value={v.vendor_id}
              onChange={(id) => {
                const found = visibleVendors.find((x) => x.id === id);
                setV({
                  ...v,
                  vendor_id: id,
                  vendor_email: found?.contact_email || "",
                  vendor_contact: found?.contact_phone || "",
                });
              }}
              options={visibleVendors}
              placeholder="Select vendor"
              onCreate={async (name) => {
                const c = await vendorFn({ data: { name } });
                qc.invalidateQueries({ queryKey: ["requirement-vendors"] });
                return c;
              }}
            />
            <div className="flex items-center justify-between gap-2 text-xs">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={vendorPage === 1 || vendorQuery.isFetching}
                onClick={() => setVendorPage((page) => page - 1)}
              >
                Previous
              </Button>
              <span role="status">
                {vendorQuery.isFetching ? "Loading vendors…" : `Page ${vendorPage}`}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!vendorQuery.data?.hasMore || vendorQuery.isFetching}
                onClick={() => setVendorPage((page) => page + 1)}
              >
                Next
              </Button>
            </div>
            {vendorQuery.error && (
              <p role="alert" className="text-xs text-destructive">
                Unable to load vendors.{" "}
                <button type="button" onClick={() => void vendorQuery.refetch()}>
                  Retry
                </button>
              </p>
            )}
          </Field>

          <Field label="Vendor Contact Email" required>
            <Input
              required
              type="email"
              value={v.vendor_email}
              onChange={(e) => setV({ ...v, vendor_email: e.target.value })}
              placeholder="account@apexstaffing.io"
            />
          </Field>
          <Field label="Vendor Contact No." required>
            <Input
              required
              type="tel"
              value={v.vendor_contact}
              onChange={(e) => setV({ ...v, vendor_contact: e.target.value })}
              placeholder="+1 (555) 234-8901"
            />
          </Field>

          <Field label="U.S. Location (City, State)" required>
            <Input
              required
              value={v.location}
              onChange={(e) => setV({ ...v, location: e.target.value })}
              placeholder="Dallas, TX or Remote, USA"
            />
          </Field>
          <Field label="Work mode" required>
            <Select
              value={v.work_mode ?? "unset"}
              onValueChange={(x) =>
                setV({ ...v, work_mode: x === "unset" ? undefined : (x as WorkMode) })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">—</SelectItem>
                {WORK_MODES.map((w) => (
                  <SelectItem key={w} value={w} className="capitalize">
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Primary technology" required>
            <Input
              required
              value={v.primary_technology}
              onChange={(e) => setV({ ...v, primary_technology: e.target.value })}
              placeholder="Java · Spring Boot"
            />
          </Field>
          <Field label="Duration" required>
            <Input
              required
              value={v.duration}
              onChange={(e) => setV({ ...v, duration: e.target.value })}
              placeholder="6 months + ext."
            />
          </Field>

          <Field label="Min experience (yrs)" required>
            <Input
              required
              type="number"
              min={0}
              value={v.min_experience_years ?? ""}
              onChange={(e) =>
                setV({ ...v, min_experience_years: e.target.value ? Number(e.target.value) : null })
              }
            />
          </Field>
          <Field label="Max experience (yrs)" required>
            <Input
              required
              type="number"
              min={0}
              value={v.max_experience_years ?? ""}
              onChange={(e) =>
                setV({ ...v, max_experience_years: e.target.value ? Number(e.target.value) : null })
              }
            />
          </Field>

          <Field label="Rate min">
            <Input
              type="number"
              min={0}
              value={v.rate_min ?? ""}
              onChange={(e) =>
                setV({ ...v, rate_min: e.target.value ? Number(e.target.value) : null })
              }
            />
          </Field>
          <Field label="Rate max">
            <Input
              type="number"
              min={0}
              value={v.rate_max ?? ""}
              onChange={(e) =>
                setV({ ...v, rate_max: e.target.value ? Number(e.target.value) : null })
              }
            />
          </Field>
          <Field label="Rate type" required>
            <Select
              value={v.rate_type ?? "unset"}
              onValueChange={(x) =>
                setV({ ...v, rate_type: x === "unset" ? undefined : (x as RateType) })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">—</SelectItem>
                {RATE_TYPES.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Currency (U.S. dollars)" required>
            <Select value={v.currency} onValueChange={(currency) => setV({ ...v, currency })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {v.currency !== "USD" && (
                  <SelectItem value={v.currency} disabled>
                    {v.currency} (existing)
                  </SelectItem>
                )}
                <SelectItem value="USD">USD — U.S. Dollar</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              U.S. locations only. Changing currency does not convert rates; review the amounts
              before saving.
            </p>
          </Field>

          <Field label="Visa types" required className="md:col-span-2">
            <div className="flex flex-wrap gap-2">
              {VISA_OPTIONS.map((visa) => {
                const active = v.visa_types.includes(visa);
                return (
                  <button
                    type="button"
                    key={visa}
                    aria-pressed={active}
                    onClick={() =>
                      setV({
                        ...v,
                        visa_types: active
                          ? v.visa_types.filter((x) => x !== visa)
                          : [...v.visa_types, visa],
                      })
                    }
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs transition-colors",
                      active
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {visa}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Status" required>
            <Select
              value={v.status}
              onValueChange={(x) => setV({ ...v, status: x as RequirementStatus })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REQ_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Priority" required>
            <Select
              value={v.priority}
              onValueChange={(x) => setV({ ...v, priority: x as RequirementPriority })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REQ_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Description" required className="md:col-span-2">
            <Textarea
              required
              rows={5}
              value={v.description}
              onChange={(e) => setV({ ...v, description: e.target.value })}
              placeholder="Role summary, responsibilities…"
            />
          </Field>

          <Field label="Recruiter notes (internal)" required className="md:col-span-2">
            <Textarea
              required
              rows={3}
              value={v.recruiter_notes}
              onChange={(e) => setV({ ...v, recruiter_notes: e.target.value })}
              placeholder="Internal-only notes — visible to your team, not to candidates."
            />
          </Field>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardContent className="space-y-4 p-6">
          <div>
            <p className="text-sm font-medium">Skills *</p>
            <p className="text-xs text-muted-foreground">
              Add at least one skill. Tag mandatory skills to give them more weight when matching.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {v.skills.length === 0 && (
              <p className="text-xs text-muted-foreground">No skills yet.</p>
            )}
            {v.skills.map((s, i) => (
              <Badge
                key={`${s.skill}-${i}`}
                variant="outline"
                className={cn(
                  "gap-1.5 pl-2.5 pr-1 py-1 font-normal",
                  s.is_mandatory
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {s.skill}
                <span className="text-[9px] uppercase tracking-widest opacity-70">
                  {s.is_mandatory ? "must" : "nice"}
                </span>
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-background/40"
                  onClick={() => setV({ ...v, skills: v.skills.filter((_, j) => j !== i) })}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[220px]">
              <Label className="text-xs">Add skill</Label>
              <Input
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill();
                  }
                }}
                placeholder="e.g. React"
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-xs">
              <Switch checked={newSkillMandatory} onCheckedChange={setNewSkillMandatory} />
              Mandatory
            </label>
            <Button type="button" variant="secondary" size="sm" onClick={addSkill}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create requirement" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function ComboEntity({
  value,
  onChange,
  options,
  placeholder,
  onCreate,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  options: { id: string; name: string }[];
  placeholder: string;
  onCreate: (name: string) => Promise<{ id: string; name: string }>;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  if (creating) {
    return (
      <div className="flex gap-1">
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Name"
        />
        <Button
          type="button"
          size="sm"
          disabled={busy || !newName.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const created = await onCreate(newName.trim());
              onChange(created.id);
              setCreating(false);
              setNewName("");
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      <Select value={value ?? "none"} onValueChange={(x) => onChange(x === "none" ? null : x)}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">—</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" size="sm" variant="outline" onClick={() => setCreating(true)}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function emptyToNull(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}
