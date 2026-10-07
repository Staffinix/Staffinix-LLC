import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CRM_STATUSES,
  CRM_TIERS,
  STATUS_LABEL,
  TIER_LABEL,
  type CrmStatus,
  type CrmTier,
} from "@/lib/crm-constants";
import { Loader2 } from "lucide-react";

export type CrmFormValues = {
  name: string;
  status: CrmStatus;
  tier: CrmTier | null;
  industry?: string | null; // clients only
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  linkedin_id?: string | null; // vendors only
  contact_role?: string | null; // vendors only
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  tax_id: string | null;
  payment_terms_days?: number | null; // vendors only
  msa_signed_at: string | null;
  notes: string | null;
};

export function CrmForm({
  kind,
  initial,
  onSubmit,
  submitting,
  submitLabel = "Save",
  onCancel,
}: {
  kind: "client" | "vendor";
  initial?: Partial<CrmFormValues>;
  onSubmit: (v: CrmFormValues) => void | Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<CrmFormValues>({
    name: initial?.name ?? "",
    status: initial?.status ?? "active",
    tier: initial?.tier ?? null,
    industry: initial?.industry ?? null,
    contact_name: initial?.contact_name ?? null,
    contact_email: initial?.contact_email ?? null,
    contact_phone: initial?.contact_phone ?? null,
    linkedin_id: initial?.linkedin_id ?? null,
    contact_role: initial?.contact_role ?? null,
    website: initial?.website ?? null,
    address: initial?.address ?? null,
    city: initial?.city ?? null,
    state: initial?.state ?? null,
    country: initial?.country ?? null,
    postal_code: initial?.postal_code ?? null,
    tax_id: initial?.tax_id ?? null,
    payment_terms_days: initial?.payment_terms_days ?? null,
    msa_signed_at: initial?.msa_signed_at ?? null,
    notes: initial?.notes ?? null,
  });

  const set = <K extends keyof CrmFormValues>(k: K, val: CrmFormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));
  const s = (val: string) => (val.trim() === "" ? null : val);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
      className="space-y-6"
    >
      <section className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-medium text-foreground">Basics</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>{kind === "vendor" ? "Company Name" : "Name"} *</Label>
            <Input
              value={v.name}
              onChange={(e) => set("name", e.target.value)}
              required
              minLength={2}
              maxLength={160}
            />
          </div>
          {kind === "client" && (
            <div>
              <Label>Industry</Label>
              <Input
                value={v.industry ?? ""}
                onChange={(e) => set("industry", s(e.target.value))}
                placeholder="e.g. Finance, Healthcare"
              />
            </div>
          )}
          <div>
            <Label>Status</Label>
            <Select value={v.status} onValueChange={(val) => set("status", val as CrmStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRM_STATUSES.map((st) => (
                  <SelectItem key={st} value={st}>
                    {STATUS_LABEL[st]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tier</Label>
            <Select
              value={v.tier ?? "unset"}
              onValueChange={(val) => set("tier", val === "unset" ? null : (val as CrmTier))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">None</SelectItem>
                {CRM_TIERS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIER_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {kind === "vendor" && (
            <div>
              <Label>Payment Terms (Days)</Label>
              <Input
                type="number"
                value={v.payment_terms_days ?? ""}
                onChange={(e) =>
                  set("payment_terms_days", e.target.value ? Number(e.target.value) : null)
                }
                placeholder="e.g. 30 (Net 30)"
              />
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-medium text-foreground">Contact Details</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>{kind === "vendor" ? "Name" : "Contact Name"}</Label>
            <Input
              value={v.contact_name ?? ""}
              onChange={(e) => set("contact_name", s(e.target.value))}
            />
          </div>
          <div>
            <Label>{kind === "vendor" ? "Mail" : "Contact Email"}</Label>
            <Input
              type="email"
              value={v.contact_email ?? ""}
              onChange={(e) => set("contact_email", s(e.target.value))}
            />
          </div>
          <div>
            <Label>{kind === "vendor" ? "Contact Number" : "Contact Phone"}</Label>
            <Input
              type="tel"
              value={v.contact_phone ?? ""}
              onChange={(e) => set("contact_phone", s(e.target.value))}
            />
          </div>
          <div>
            <Label>Website</Label>
            <Input
              type="url"
              value={v.website ?? ""}
              onChange={(e) => set("website", s(e.target.value))}
              placeholder="https://..."
            />
          </div>
          {kind === "vendor" && (
            <>
              <div>
                <Label>LinkedIn ID</Label>
                <Input
                  value={v.linkedin_id ?? ""}
                  onChange={(e) => set("linkedin_id", s(e.target.value))}
                  placeholder="Profile URL or LinkedIn ID"
                  maxLength={255}
                />
              </div>
              <div>
                <Label>Role</Label>
                <Input
                  value={v.contact_role ?? ""}
                  onChange={(e) => set("contact_role", s(e.target.value))}
                  placeholder="e.g. Account Manager"
                  maxLength={120}
                />
              </div>
            </>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-medium text-foreground">Address</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Street Address</Label>
            <Input value={v.address ?? ""} onChange={(e) => set("address", s(e.target.value))} />
          </div>
          <div>
            <Label>City</Label>
            <Input value={v.city ?? ""} onChange={(e) => set("city", s(e.target.value))} />
          </div>
          <div>
            <Label>State / Province</Label>
            <Input value={v.state ?? ""} onChange={(e) => set("state", s(e.target.value))} />
          </div>
          <div>
            <Label>Country</Label>
            <Input value={v.country ?? ""} onChange={(e) => set("country", s(e.target.value))} />
          </div>
          <div>
            <Label>Postal Code</Label>
            <Input
              value={v.postal_code ?? ""}
              onChange={(e) => set("postal_code", s(e.target.value))}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-medium text-foreground">Compliance</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Tax ID / EIN</Label>
            <Input value={v.tax_id ?? ""} onChange={(e) => set("tax_id", s(e.target.value))} />
          </div>
          <div>
            <Label>MSA signed on</Label>
            <Input
              type="date"
              value={v.msa_signed_at ?? ""}
              onChange={(e) => set("msa_signed_at", s(e.target.value))}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <Label>Notes</Label>
        <Textarea
          rows={4}
          value={v.notes ?? ""}
          onChange={(e) => set("notes", s(e.target.value))}
          placeholder="Internal notes about this relationship..."
        />
      </section>

      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
