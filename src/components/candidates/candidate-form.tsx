import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, Loader2, Save, Sparkles, User } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { shouldAdvanceCandidateFormOnEnter } from "@/lib/candidate-form-keyboard";
import {
  CANDIDATE_FORM_VISA_OPTIONS,
  MARKETING_TYPES,
  type MarketingType,
  toggleMarketingType,
} from "@/lib/candidates-constants";
import {
  createCandidate,
  createCandidateResumeUpload,
  createCandidateWithResume,
  updateCandidate,
} from "@/lib/candidates.functions";
import { formatUsPhone, normalizeUsPhone, US_PHONE_ERROR } from "@/lib/us-phone";

type Availability = "immediate" | "two_weeks" | "one_month" | "negotiable";

export interface CandidateFormInitialData {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  current_title: string | null;
  required_job: string | null;
  location: string | null;
  experience_years: number | null;
  visa_status: string | null;
  availability: string | null;
  ready_to_relocate: boolean | null;
  preferred_location: string | null;
  marketing_types: string[] | null;
  skills: Array<{ skill: string }>;
}

interface CandidateFormProps {
  mode: "create" | "edit";
  initialData?: CandidateFormInitialData;
  onSaved: (candidateId: string) => void;
}

export function CandidateForm({ mode, initialData, onSaved }: CandidateFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [first, setFirst] = useState(initialData?.first_name ?? "");
  const [last, setLast] = useState(initialData?.last_name ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [phone, setPhone] = useState(formatUsPhone(initialData?.phone ?? ""));
  const [phoneError, setPhoneError] = useState("");
  const [currentJob, setCurrentJob] = useState(initialData?.current_title ?? "");
  const [requiredJob, setRequiredJob] = useState(initialData?.required_job ?? "");
  const [techSkills, setTechSkills] = useState(
    initialData?.skills.map((item) => item.skill).join(", ") ?? "",
  );
  const [expYears, setExpYears] = useState(initialData?.experience_years?.toString() ?? "");
  const [location, setLocation] = useState(initialData?.location ?? "");
  const selectableInitialVisa = CANDIDATE_FORM_VISA_OPTIONS.includes(
    initialData?.visa_status as (typeof CANDIDATE_FORM_VISA_OPTIONS)[number],
  );
  const [visa, setVisa] = useState(
    mode === "create" ? "H1B" : selectableInitialVisa ? (initialData?.visa_status ?? "") : "",
  );
  const legacyVisa = mode === "edit" && initialData?.visa_status && !selectableInitialVisa;
  const [availability, setAvailability] = useState<Availability>(
    initialData?.availability && initialData.availability !== "unavailable"
      ? (initialData.availability as Availability)
      : "immediate",
  );
  const [readyToRelocate, setReadyToRelocate] = useState(
    initialData?.ready_to_relocate === false ? "no" : "yes",
  );
  const [preferredLocation, setPreferredLocation] = useState(initialData?.preferred_location ?? "");
  const [marketingTypes, setMarketingTypes] = useState<MarketingType[]>(
    (initialData?.marketing_types ?? []).filter((value): value is MarketingType =>
      MARKETING_TYPES.includes(value as MarketingType),
    ),
  );
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createFn = useServerFn(createCandidate);
  const createWithResumeFn = useServerFn(createCandidateWithResume);
  const createUploadFn = useServerFn(createCandidateResumeUpload);
  const updateFn = useServerFn(updateCandidate);

  const skills = useMemo(
    () =>
      techSkills
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    [techSkills],
  );

  function validatePhone() {
    if (!phone.trim()) {
      setPhoneError("");
      return null;
    }
    const normalized = normalizeUsPhone(phone);
    setPhoneError(normalized ? "" : US_PHONE_ERROR);
    return normalized;
  }

  function handleEnter(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") return;
    const target = event.target as HTMLElement;
    if (
      !shouldAdvanceCandidateFormOnEnter({
        tagName: target.tagName,
        type: target.getAttribute("type"),
        role: target.getAttribute("role"),
        ariaExpanded: target.getAttribute("aria-expanded"),
        ariaAutocomplete: target.getAttribute("aria-autocomplete"),
        isComposing: event.nativeEvent.isComposing,
        hasModifier: event.altKey || event.ctrlKey || event.metaKey || event.shiftKey,
      })
    )
      return;

    const controls = Array.from(
      formRef.current?.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([disabled]), select:not([disabled]), [role="combobox"]:not([disabled]), [role="checkbox"]:not([disabled]), [role="radio"]:not([disabled]), [role="switch"]:not([disabled])',
      ) ?? [],
    ).filter((element) => element.offsetParent !== null && element.tabIndex >= 0);
    const index = controls.indexOf(target);
    event.preventDefault();
    if (index < 0 || index === controls.length - 1) return;
    controls[index + 1]?.focus();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    if (!first.trim() || !last.trim() || !currentJob.trim() || !requiredJob.trim()) {
      toast.error("First name, last name, current job, and required job are required.");
      return;
    }
    const normalizedPhone = validatePhone();
    if (phone.trim() && !normalizedPhone) {
      formRef.current?.querySelector<HTMLInputElement>('[name="phone"]')?.focus();
      return;
    }
    if (readyToRelocate === "no" && !preferredLocation.trim()) {
      toast.error("Enter a preferred location when the candidate is not ready to relocate.");
      return;
    }

    setIsSubmitting(true);
    try {
      const common = {
        first_name: first.trim(),
        last_name: last.trim(),
        email: email.trim() || null,
        phone: normalizedPhone,
        current_title: currentJob.trim(),
        required_job: requiredJob.trim(),
        ready_to_relocate: readyToRelocate === "yes",
        preferred_location: readyToRelocate === "no" ? preferredLocation.trim() : null,
        primary_technology: skills[0] ?? null,
        ...(visa ? { visa_status: visa } : {}),
        experience_years: expYears ? Number(expYears) : null,
        location: location.trim() || null,
        availability,
        marketing_types: marketingTypes,
        skills: skills.map((skill, index) => ({ skill, is_primary: index === 0 })),
      };

      if (mode === "edit" && initialData) {
        await updateFn({ data: { id: initialData.id, ...common } });
        toast.success("Candidate updated successfully.");
        onSaved(initialData.id);
        return;
      }

      const candidate = {
        ...common,
        status: "active" as const,
        source: "manual" as const,
        currency: "USD",
        employment: [],
        education: [],
        projects: [],
        certifications: [],
      };
      let created: { id: string };
      if (resumeFile) {
        if (resumeFile.size < 1 || resumeFile.size > 10 * 1024 * 1024) {
          throw new Error("Resume must be between 1 byte and 10 MiB.");
        }
        const lowerName = resumeFile.name.toLowerCase();
        const mimeType = lowerName.endsWith(".pdf")
          ? "application/pdf"
          : lowerName.endsWith(".docx")
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : null;
        if (!mimeType) throw new Error("Resume must be a PDF or DOCX file.");
        const grant = await createUploadFn({
          data: { file_name: resumeFile.name, mime_type: mimeType, size_bytes: resumeFile.size },
        });
        const { error } = await supabase.storage
          .from("resume-uploads")
          .uploadToSignedUrl(grant.path, grant.token, resumeFile, { contentType: mimeType });
        if (error) throw new Error(`Resume upload failed: ${error.message}`);
        created = await createWithResumeFn({ data: { candidate, upload_id: grant.upload_id } });
      } else {
        created = await createFn({ data: candidate });
      }
      toast.success("Bench candidate added.");
      onSaved(created.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Candidate could not be saved.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full border-border bg-card shadow-sm">
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <User className="h-4 w-4 text-primary" /> Candidate Details
        </CardTitle>
        <CardDescription className="text-xs">
          {mode === "edit"
            ? "Update this candidate without changing their record ID."
            : "Register a candidate in the bench database."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          onKeyDownCapture={handleEnter}
          className="space-y-5"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="First Name" required>
              <Input value={first} onChange={(e) => setFirst(e.target.value)} required />
            </Field>
            <Field label="Last Name" required>
              <Input value={last} onChange={(e) => setLast(e.target.value)} required />
            </Field>
            <Field label="Email Address">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="US Phone Number" error={phoneError}>
              <Input
                name="phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (phoneError) setPhoneError("");
                }}
                onBlur={() => {
                  const normalized = validatePhone();
                  if (normalized) setPhone(formatUsPhone(normalized));
                }}
                aria-invalid={Boolean(phoneError)}
                aria-describedby={phoneError ? "candidate-phone-error" : undefined}
                placeholder="(317) 555-0188"
              />
            </Field>
            <Field label="Current Job" required>
              <Input value={currentJob} onChange={(e) => setCurrentJob(e.target.value)} required />
            </Field>
            <Field label="Required Job" required>
              <Input
                value={requiredJob}
                onChange={(e) => setRequiredJob(e.target.value)}
                required
              />
            </Field>
          </div>
          <Field label="Tech / Skills (comma-separated)">
            <Input
              value={techSkills}
              onChange={(e) => setTechSkills(e.target.value)}
              placeholder="React, TypeScript, Node.js"
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Years of Experience">
              <Input
                type="number"
                min="0"
                max="60"
                step="0.5"
                value={expYears}
                onChange={(e) => setExpYears(e.target.value)}
              />
            </Field>
            <Field label="Location">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </Field>
            <Field label="Ready to Relocate?" required>
              <Select value={readyToRelocate} onValueChange={setReadyToRelocate}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {readyToRelocate === "no" && (
              <Field label="Preferred Location" required>
                <Input
                  value={preferredLocation}
                  onChange={(e) => setPreferredLocation(e.target.value)}
                  required
                />
              </Field>
            )}
          </div>
          {mode === "create" && (
            <Field label="Upload Resume">
              <div className="rounded-md border border-dashed border-border p-4">
                <div className="flex items-center gap-3">
                  <FileUp className="h-5 w-5 text-primary" />
                  <Input
                    type="file"
                    accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
                    onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  PDF or DOCX, up to 10 MiB{resumeFile ? ` · ${resumeFile.name}` : ""}.
                </p>
              </div>
            </Field>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Work Authorization / Visa Status" required={mode === "create"}>
              <Select value={visa} onValueChange={setVisa}>
                <SelectTrigger>
                  <SelectValue placeholder="Select visa status" />
                </SelectTrigger>
                <SelectContent>
                  {CANDIDATE_FORM_VISA_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {legacyVisa && !visa && (
                <p className="text-xs text-muted-foreground">
                  Legacy value “{initialData?.visa_status}” is preserved until you select a current
                  visa option.
                </p>
              )}
            </Field>
            <Field label="Bench Availability" required>
              <Select
                value={availability}
                onValueChange={(value) => setAvailability(value as Availability)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">Immediate Start</SelectItem>
                  <SelectItem value="two_weeks">2 Weeks Notice</SelectItem>
                  <SelectItem value="one_month">1 Month Notice</SelectItem>
                  <SelectItem value="negotiable">Negotiable</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <fieldset className="space-y-2 rounded-lg border border-border p-4">
            <legend className="px-1 text-xs font-semibold">Marketing Type</legend>
            <p className="text-xs text-muted-foreground">Select all engagement types that apply.</p>
            <div className="flex flex-wrap gap-4">
              {MARKETING_TYPES.map((option) => (
                <label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={marketingTypes.includes(option)}
                    onCheckedChange={() =>
                      setMarketingTypes((current) => toggleMarketingType(current, option))
                    }
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <Button variant="outline" size="sm" asChild>
              {mode === "edit" && initialData ? (
                <Link to="/candidates/$id" params={{ id: initialData.id }}>
                  Cancel
                </Link>
              ) : (
                <Link to="/candidates">Cancel</Link>
              )}
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting} className="gap-2 font-semibold">
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "edit" ? (
                <Save className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isSubmitting ? "Saving…" : mode === "edit" ? "Save Changes" : "Add Candidate"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">
        {label}
        {required ? " *" : ""}
      </Label>
      {children}
      {error && (
        <p id="candidate-phone-error" role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
