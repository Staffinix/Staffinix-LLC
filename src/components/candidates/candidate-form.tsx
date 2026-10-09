import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BriefcaseBusiness,
  FileUp,
  GraduationCap,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { supabase } from "@/integrations/supabase/client";
import { shouldAdvanceCandidateFormOnEnter } from "@/lib/candidate-form-keyboard";
import {
  CANDIDATE_FORM_VISA_OPTIONS,
  MARKETING_TYPES,
  type MarketingType,
  toggleMarketingType,
} from "@/lib/candidates-constants";
import {
  attachCandidateResume,
  createCandidate,
  createCandidateResumeUpload,
  createCandidateWithResume,
  updateCandidate,
} from "@/lib/candidates.functions";
import { formatUsPhone, normalizeUsPhone, US_PHONE_ERROR } from "@/lib/us-phone";

type Availability = "immediate" | "two_weeks" | "one_month" | "negotiable";

type EmploymentFormItem = {
  clientId: string;
  company: string;
  title: string;
  location: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  description: string;
};

type EducationFormItem = {
  clientId: string;
  institution: string;
  degree: string;
  field: string;
  start_year: string;
  end_year: string;
};

function newClientId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function emptyEmployment(): EmploymentFormItem {
  return {
    clientId: newClientId(),
    company: "",
    title: "",
    location: "",
    start_date: "",
    end_date: "",
    is_current: false,
    description: "",
  };
}

function emptyEducation(): EducationFormItem {
  return {
    clientId: newClientId(),
    institution: "",
    degree: "",
    field: "",
    start_year: "",
    end_year: "",
  };
}

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
  employment: Array<{
    company: string;
    title: string | null;
    location: string | null;
    start_date: string | null;
    end_date: string | null;
    is_current: boolean;
    description: string | null;
  }>;
  education: Array<{
    institution: string;
    degree: string | null;
    field: string | null;
    start_year: number | null;
    end_year: number | null;
  }>;
  resumes: Array<{ id: string; file_name: string; is_primary: boolean }>;
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
  const [employment, setEmployment] = useState<EmploymentFormItem[]>(
    initialData?.employment.map((job) => ({
      clientId: newClientId(),
      company: job.company,
      title: job.title ?? "",
      location: job.location ?? "",
      start_date: job.start_date ?? "",
      end_date: job.end_date ?? "",
      is_current: job.is_current,
      description: job.description ?? "",
    })) ?? [],
  );
  const [education, setEducation] = useState<EducationFormItem[]>(
    initialData?.education.map((item) => ({
      clientId: newClientId(),
      institution: item.institution,
      degree: item.degree ?? "",
      field: item.field ?? "",
      start_year: item.start_year?.toString() ?? "",
      end_year: item.end_year?.toString() ?? "",
    })) ?? [],
  );
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createFn = useServerFn(createCandidate);
  const createWithResumeFn = useServerFn(createCandidateWithResume);
  const createUploadFn = useServerFn(createCandidateResumeUpload);
  const attachResumeFn = useServerFn(attachCandidateResume);
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
    const invalidEmployment = employment.find((job) => !job.company.trim());
    if (invalidEmployment) {
      toast.error("Company name is required for every employment entry.");
      return;
    }
    const invalidEducation = education.find((item) => !item.institution.trim());
    if (invalidEducation) {
      toast.error("Institution is required for every education entry.");
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
        employment: employment.map(({ clientId: _clientId, ...job }) => ({
          ...job,
          company: job.company.trim(),
          title: job.title.trim() || null,
          location: job.location.trim() || null,
          end_date: job.is_current ? null : job.end_date || null,
          start_date: job.start_date || null,
          description: job.description.trim() || null,
        })),
        education: education.map(({ clientId: _clientId, ...item }) => ({
          ...item,
          institution: item.institution.trim(),
          degree: item.degree.trim() || null,
          field: item.field.trim() || null,
          start_year: item.start_year ? Number(item.start_year) : null,
          end_year: item.end_year ? Number(item.end_year) : null,
        })),
      };

      if (mode === "edit" && initialData) {
        await updateFn({ data: { id: initialData.id, ...common } });
        if (resumeFile) {
          const grant = await uploadResumeToStaging(resumeFile, createUploadFn);
          await attachResumeFn({
            data: { candidate_id: initialData.id, upload_id: grant.upload_id },
          });
        }
        toast.success("Candidate updated successfully.");
        onSaved(initialData.id);
        return;
      }

      const candidate = {
        ...common,
        status: "active" as const,
        source: "manual" as const,
        currency: "USD",
        projects: [],
        certifications: [],
      };
      let created: { id: string };
      if (resumeFile) {
        const grant = await uploadResumeToStaging(resumeFile, createUploadFn);
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
          <Field label={mode === "edit" ? "Update Resume" : "Upload Resume"}>
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
                {mode === "edit" && initialData?.resumes.length
                  ? `Current: ${initialData.resumes.find((resume) => resume.is_primary)?.file_name ?? initialData.resumes[0]?.file_name}. Choose a file to replace the primary resume. `
                  : ""}
                PDF or DOCX, up to 10 MiB{resumeFile ? ` · Selected: ${resumeFile.name}` : ""}.
              </p>
            </div>
          </Field>
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
          <EmploymentSection items={employment} onChange={setEmployment} />
          <EducationSection items={education} onChange={setEducation} />
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

async function uploadResumeToStaging(
  file: File,
  createUpload: (options: {
    data: { file_name: string; mime_type: string; size_bytes: number };
  }) => Promise<{ upload_id: string; path: string; token: string }>,
) {
  if (file.size < 1 || file.size > 10 * 1024 * 1024) {
    throw new Error("Resume must be between 1 byte and 10 MiB.");
  }
  const lowerName = file.name.toLowerCase();
  const mimeType = lowerName.endsWith(".pdf")
    ? "application/pdf"
    : lowerName.endsWith(".docx")
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : null;
  if (!mimeType) throw new Error("Resume must be a PDF or DOCX file.");

  const grant = await createUpload({
    data: { file_name: file.name, mime_type: mimeType, size_bytes: file.size },
  });
  const { error } = await supabase.storage
    .from("resume-uploads")
    .uploadToSignedUrl(grant.path, grant.token, file, { contentType: mimeType });
  if (error) throw new Error(`Resume upload failed: ${error.message}`);
  return grant;
}

function EmploymentSection({
  items,
  onChange,
}: {
  items: EmploymentFormItem[];
  onChange: React.Dispatch<React.SetStateAction<EmploymentFormItem[]>>;
}) {
  const update = (index: number, patch: Partial<EmploymentFormItem>) =>
    onChange((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );

  return (
    <fieldset className="space-y-4 rounded-lg border border-border p-4">
      <legend className="px-1 text-xs font-semibold">Employment</legend>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Add the candidate’s work history.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => onChange((current) => [...current, emptyEmployment()])}
        >
          <Plus className="h-3.5 w-3.5" /> Add Employment
        </Button>
      </div>
      {items.length === 0 && (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          No employment history added.
        </p>
      )}
      {items.map((job, index) => (
        <div
          key={job.clientId}
          className="space-y-4 rounded-lg border border-border bg-background/35 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <BriefcaseBusiness className="h-4 w-4 text-primary" /> Employment {index + 1}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove employment ${index + 1}`}
              onClick={() =>
                onChange((current) => current.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Company" required>
              <Input
                value={job.company}
                onChange={(event) => update(index, { company: event.target.value })}
                required
              />
            </Field>
            <Field label="Job Title">
              <Input
                value={job.title}
                onChange={(event) => update(index, { title: event.target.value })}
              />
            </Field>
            <Field label="Location">
              <Input
                value={job.location}
                onChange={(event) => update(index, { location: event.target.value })}
              />
            </Field>
            <div className="flex items-end pb-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={job.is_current}
                  onCheckedChange={(checked) =>
                    update(index, {
                      is_current: checked === true,
                      end_date: checked ? "" : job.end_date,
                    })
                  }
                />
                Current employment
              </label>
            </div>
            <Field label="Start Date">
              <Input
                type="date"
                value={job.start_date}
                onChange={(event) => update(index, { start_date: event.target.value })}
              />
            </Field>
            <Field label="End Date">
              <Input
                type="date"
                value={job.end_date}
                disabled={job.is_current}
                onChange={(event) => update(index, { end_date: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              value={job.description}
              onChange={(event) => update(index, { description: event.target.value })}
              placeholder="Responsibilities, achievements, and relevant work"
            />
          </Field>
        </div>
      ))}
    </fieldset>
  );
}

function EducationSection({
  items,
  onChange,
}: {
  items: EducationFormItem[];
  onChange: React.Dispatch<React.SetStateAction<EducationFormItem[]>>;
}) {
  const update = (index: number, patch: Partial<EducationFormItem>) =>
    onChange((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );

  return (
    <fieldset className="space-y-4 rounded-lg border border-border p-4">
      <legend className="px-1 text-xs font-semibold">Education</legend>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Add degrees, programs, and institutions.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => onChange((current) => [...current, emptyEducation()])}
        >
          <Plus className="h-3.5 w-3.5" /> Add Education
        </Button>
      </div>
      {items.length === 0 && (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          No education history added.
        </p>
      )}
      {items.map((item, index) => (
        <div
          key={item.clientId}
          className="space-y-4 rounded-lg border border-border bg-background/35 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <GraduationCap className="h-4 w-4 text-primary" /> Education {index + 1}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove education ${index + 1}`}
              onClick={() =>
                onChange((current) => current.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Institution" required>
              <Input
                value={item.institution}
                onChange={(event) => update(index, { institution: event.target.value })}
                required
              />
            </Field>
            <Field label="Degree">
              <Input
                value={item.degree}
                onChange={(event) => update(index, { degree: event.target.value })}
                placeholder="B.Tech, MBA, M.S."
              />
            </Field>
            <Field label="Field of Study">
              <Input
                value={item.field}
                onChange={(event) => update(index, { field: event.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start Year">
                <Input
                  type="number"
                  min="1950"
                  max="2100"
                  value={item.start_year}
                  onChange={(event) => update(index, { start_year: event.target.value })}
                />
              </Field>
              <Field label="End Year">
                <Input
                  type="number"
                  min="1950"
                  max="2100"
                  value={item.end_year}
                  onChange={(event) => update(index, { end_year: event.target.value })}
                />
              </Field>
            </div>
          </div>
        </div>
      ))}
    </fieldset>
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

