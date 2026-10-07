import { useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Globe2,
  Hash,
  Mail,
  MapPin,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createTenant } from "@/lib/tenancy.functions";

export const Route = createFileRoute("/_authenticated/tenants/new")({
  head: () => ({ meta: [{ title: "New Tenant Registration — Staffinix" }] }),
  component: NewTenantRegistrationPage,
});

const INDUSTRIES = [
  "IT Staffing & Consulting",
  "Healthcare Staffing",
  "Finance & Accounting",
  "Engineering",
  "Professional Services",
  "Other",
] as const;

const PLANS = [
  { value: "starter", label: "Starter", seats: 10 },
  { value: "growth", label: "Growth", seats: 25 },
  { value: "enterprise", label: "Enterprise", seats: 50 },
] as const;

type Plan = (typeof PLANS)[number]["value"];

type RegistrationForm = {
  companyName: string;
  industry: string;
  website: string;
  contactEmail: string;
  taxId: string;
  companyAddress: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  adminName: string;
  adminEmail: string;
  adminPhone: string;
};

const EMPTY_FORM: RegistrationForm = {
  companyName: "",
  industry: "IT Staffing & Consulting",
  website: "",
  contactEmail: "",
  taxId: "",
  companyAddress: "",
  ownerName: "",
  ownerEmail: "",
  ownerPhone: "",
  adminName: "",
  adminEmail: "",
  adminPhone: "",
};

function NewTenantRegistrationPage() {
  const navigate = useNavigate();
  const createTenantFn = useServerFn(createTenant);
  const [form, setForm] = useState(EMPTY_FORM);
  const [plan, setPlan] = useState<Plan>("enterprise");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof RegistrationForm>(field: K, value: RegistrationForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    const selectedPlan = PLANS.find((option) => option.value === plan)!;

    try {
      await createTenantFn({
        data: {
          name: form.companyName,
          slug: slugify(form.companyName),
          industry: form.industry,
          website: emptyToNull(form.website),
          primary_contact_email: form.contactEmail,
          tax_id: emptyToNull(form.taxId),
          company_address: emptyToNull(form.companyAddress),
          owner_contact_name: emptyToNull(form.ownerName),
          owner_contact_email: form.ownerEmail,
          owner_contact_phone: emptyToNull(form.ownerPhone),
          admin_contact_name: emptyToNull(form.adminName),
          admin_contact_email: form.adminEmail,
          admin_contact_phone: emptyToNull(form.adminPhone),
          plan,
          status: "active",
          seat_limit: selectedPlan.seats,
        },
      });
      toast.success("Tenant registered successfully");
      navigate({ to: "/platform" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tenant could not be registered");
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <AppTopbar title="New Tenant Registration" />
      <main className="flex-1 space-y-5 p-5 md:p-7">
        <PageHeader
          title="New Tenant Registration"
          description="Register a new customer organization, set up company credentials, and assign primary owner and administrative contacts."
        />

        <form className="space-y-5" onSubmit={handleSubmit}>
          <Card className="border-border bg-card">
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-primary" /> Company Profile & Organization Info
              </CardTitle>
              <CardDescription>
                General company details, tax registration number, and primary headquarters location.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="1. Company Name" required>
                  <Input
                    required
                    maxLength={120}
                    value={form.companyName}
                    onChange={(event) => updateField("companyName", event.target.value)}
                    placeholder="e.g. Nukasani Group Inc"
                    autoComplete="organization"
                  />
                </Field>
                <Field label="2. Industry" required>
                  <Select
                    value={form.industry}
                    onValueChange={(value) => updateField("industry", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((industry) => (
                        <SelectItem key={industry} value={industry}>
                          {industry}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <Field label="3. Company Website" icon={<Globe2 className="h-3.5 w-3.5" />}>
                  <Input
                    type="url"
                    maxLength={200}
                    value={form.website}
                    onChange={(event) => updateField("website", event.target.value)}
                    placeholder="https://company.com"
                    autoComplete="url"
                  />
                </Field>
                <Field label="4. Contact Email Id" required icon={<Mail className="h-3.5 w-3.5" />}>
                  <Input
                    required
                    type="email"
                    maxLength={200}
                    value={form.contactEmail}
                    onChange={(event) => updateField("contactEmail", event.target.value)}
                    placeholder="info@company.com"
                    autoComplete="email"
                  />
                </Field>
                <Field label="5. EIN No." icon={<Hash className="h-3.5 w-3.5" />}>
                  <Input
                    maxLength={80}
                    value={form.taxId}
                    onChange={(event) => updateField("taxId", event.target.value)}
                    placeholder="12-3456789"
                  />
                </Field>
              </div>

              <Field label="6. Company Address" icon={<MapPin className="h-3.5 w-3.5" />}>
                <Input
                  maxLength={500}
                  value={form.companyAddress}
                  onChange={(event) => updateField("companyAddress", event.target.value)}
                  placeholder="e.g. 550 Congressional Blvd, Suite 210, Carmel, IN 46032"
                  autoComplete="street-address"
                />
              </Field>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-foreground">
                  Target Subscription Plan
                </legend>
                <div className="grid gap-3 md:grid-cols-3">
                  {PLANS.map((option) => {
                    const selected = option.value === plan;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setPlan(option.value)}
                        className={cn(
                          "rounded-lg border px-4 py-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background/30 text-foreground hover:border-primary/50 hover:bg-muted/40",
                        )}
                      >
                        <span className="block text-xs font-semibold uppercase tracking-wide">
                          {option.label}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {option.seats} User Seats
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </CardContent>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <ContactCard
              title="7A. Company Owner Contact Details"
              description="Primary business owner or executive sponsor information."
              icon={<UserRound className="h-4 w-4 text-primary" />}
              nameLabel="Owner Full Name"
              emailLabel="Owner Email Id"
              phoneLabel="Owner Mobile No."
              name={form.ownerName}
              email={form.ownerEmail}
              phone={form.ownerPhone}
              namePlaceholder="e.g. Bhavani Nukasani"
              emailPlaceholder="owner@company.com"
              phonePlaceholder="+1 (317) 555-0188"
              onNameChange={(value) => updateField("ownerName", value)}
              onEmailChange={(value) => updateField("ownerEmail", value)}
              onPhoneChange={(value) => updateField("ownerPhone", value)}
            />
            <ContactCard
              title="7B. Company Admin Contact Details"
              description="Administrative point of contact responsible for account setup."
              icon={<ShieldCheck className="h-4 w-4 text-emerald-500" />}
              nameLabel="Admin Full Name"
              emailLabel="Admin Email Id"
              phoneLabel="Admin Mobile No."
              name={form.adminName}
              email={form.adminEmail}
              phone={form.adminPhone}
              namePlaceholder="e.g. Rajesh V."
              emailPlaceholder="admin@company.com"
              phonePlaceholder="+1 (317) 555-0199"
              onNameChange={(value) => updateField("adminName", value)}
              onEmailChange={(value) => updateField("adminEmail", value)}
              onPhoneChange={(value) => updateField("adminPhone", value)}
            />
          </div>

          <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row sm:items-center">
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/platform" })}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Cancel & Return to Platform
            </Button>
            <Button type="submit" disabled={isSubmitting} className="min-w-48">
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {isSubmitting ? "Registering…" : "Submit & Register Tenant"}
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}

function ContactCard({
  title,
  description,
  icon,
  nameLabel,
  emailLabel,
  phoneLabel,
  name,
  email,
  phone,
  namePlaceholder,
  emailPlaceholder,
  phonePlaceholder,
  onNameChange,
  onEmailChange,
  onPhoneChange,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  nameLabel: string;
  emailLabel: string;
  phoneLabel: string;
  name: string;
  email: string;
  phone: string;
  namePlaceholder: string;
  emailPlaceholder: string;
  phonePlaceholder: string;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon} {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <Field label={nameLabel}>
          <Input
            maxLength={120}
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={namePlaceholder}
            autoComplete="name"
          />
        </Field>
        <Field label={emailLabel} required>
          <Input
            required
            type="email"
            maxLength={255}
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder={emailPlaceholder}
            autoComplete="email"
          />
        </Field>
        <Field label={phoneLabel}>
          <Input
            type="tel"
            maxLength={40}
            value={phone}
            onChange={(event) => onPhoneChange(event.target.value)}
            placeholder={phonePlaceholder}
            autoComplete="tel"
          />
        </Field>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  required = false,
  icon,
  children,
}: {
  label: string;
  required?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function emptyToNull(value: string) {
  const normalized = value.trim();
  return normalized || null;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
