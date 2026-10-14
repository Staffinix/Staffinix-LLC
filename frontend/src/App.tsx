import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { candidateConfirmationPath, captureInvitationToken, clearPendingInvitationToken, getPendingInvitationToken, isUnconfirmedEmailError } from "./invitation";
import { api, hasE2ESession, supabase } from "./lib";

type Session = { id: string; template_id: string; available_until: string };
type Job = { id: string; title: string; description: string; required_skills: string[] };
type Interview = { id: string; job_id: string; name: string; duration_minutes: number; attempt_limit: number; published: boolean };
type Question = { id: string; template_id: string; text: string; position: number; time_limit_seconds: number; approved: boolean; rubric: Record<string, unknown> };
type Invitation = { id: string; expires_at: string; delivery_status: string };
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}

function toLocalDateTimeInput(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen"><header className="border-b border-slate-800"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4"><Link to="/" className="text-xl font-bold tracking-tight">Interview<span className="text-cyan-400">OS</span></Link><button className="text-sm text-slate-300 hover:text-white" onClick={() => supabase.auth.signOut()}>Sign out</button></div></header><main className="mx-auto max-w-6xl px-6 py-10">{children}</main></div>;
}

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const candidateDestination = new URLSearchParams(location.search).get("next") === "candidate";
  const [hasInvitation] = useState(() => Boolean(getPendingInvitationToken(localStorage)));
  const [mode, setMode] = useState<"signin" | "signup">(hasInvitation ? "signup" : "signin");
  const [message, setMessage] = useState("");
  const [messageIsSuccess, setMessageIsSuccess] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState("");
  const [isResending, setIsResending] = useState(false);
  const confirmationRedirectTo = `${window.location.origin}${candidateConfirmationPath(hasInvitation)}`;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const submit = handleSubmit(async ({ email, password }) => {
    setMessage("");
    setMessageIsSuccess(false);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: confirmationRedirectTo },
      });
      if (error) {
        setMessage(error.message);
      } else if (data.session) {
        navigate(hasInvitation ? "/invite" : "/candidate");
      } else {
        setMessageIsSuccess(true);
        setMessage("Account created. Check your email to confirm it, then return to this browser. If needed, reopen the original invitation link.");
      }
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      setUnconfirmedEmail(isUnconfirmedEmailError(error) ? email : "");
    } else navigate(hasInvitation ? "/invite" : (candidateDestination ? "/candidate" : "/company"));
  });
  const resendConfirmation = async () => {
    setIsResending(true);
    setMessage("");
    const { error } = await supabase.auth.resend({ type: "signup", email: unconfirmedEmail, options: { emailRedirectTo: confirmationRedirectTo } });
    setIsResending(false);
    setMessageIsSuccess(!error);
    setMessage(error ? error.message : "Confirmation email sent. Check your inbox and spam folder, then open the confirmation link.");
    if (!error) setUnconfirmedEmail("");
  };
  const switchMode = () => { setMode((current) => current === "signin" ? "signup" : "signin"); setMessage(""); setMessageIsSuccess(false); setUnconfirmedEmail(""); };
  return <main className="grid min-h-screen place-items-center px-6"><section className="card w-full max-w-md"><p className="mb-2 text-sm font-semibold uppercase tracking-[.2em] text-cyan-400">{hasInvitation ? "Candidate invitation" : (candidateDestination ? "Candidate portal" : "Secure access")}</p><h1 className="text-3xl font-bold">{mode === "signup" ? "Create your account" : "Welcome back"}</h1><p className="mt-2 text-slate-400">{hasInvitation ? (mode === "signup" ? "Use the same email address that received the invitation." : "Sign in with the invited candidate account.") : (candidateDestination ? "Sign in to view your assigned interviews." : "Use your verified company account.")}</p><form onSubmit={submit} className="mt-8 space-y-4"><label className="block"><span className="label">Email</span><input className="input" type="email" autoComplete="email" {...register("email")} />{errors.email && <small className="text-rose-400">{errors.email.message}</small>}</label><label className="block"><span className="label">Password</span><input className="input" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} {...register("password")} />{errors.password && <small className="text-rose-400">{errors.password.message}</small>}</label>{message && <p role={messageIsSuccess ? "status" : "alert"} className={`text-sm ${messageIsSuccess ? "text-emerald-300" : "text-rose-400"}`}>{message}</p>}{unconfirmedEmail && <button className="w-full text-sm font-medium text-cyan-300 hover:text-cyan-200" type="button" onClick={resendConfirmation} disabled={isResending}>{isResending ? "Sending confirmation…" : "Resend confirmation email"}</button>}<button className="button w-full" disabled={isSubmitting}>{isSubmitting ? (mode === "signup" ? "Creating account…" : "Signing in…") : (mode === "signup" ? "Create candidate account" : "Sign in")}</button></form><button className="mt-6 block w-full text-center text-sm text-cyan-300" type="button" onClick={switchMode}>{mode === "signup" ? "Already have an account? Sign in" : "New candidate? Create an account"}</button>{!hasInvitation && mode === "signup" && <p className="mt-3 text-center text-xs text-slate-500">Candidate interviews require an invitation from the company.</p>}{!hasInvitation && <Link className="mt-4 block text-center text-sm text-slate-400 hover:text-white" to={candidateDestination ? "/login" : "/login?next=candidate"}>{candidateDestination ? "Company sign in" : "Candidate portal"}</Link>}</section></main>;
}

function PdfQuestionImporter({ templateId, published }: { templateId: string; published: boolean }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [randomCount, setRandomCount] = useState(5);
  const [fileError, setFileError] = useState("");

  const extract = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a PDF first");
      const form = new FormData();
      form.append("file", file);
      return api<{ questions: string[] }>(`/api/v1/interviews/${templateId}/questions/extract-pdf`, { method: "POST", body: form });
    },
    onSuccess: ({ questions: extracted }) => {
      setQuestions(extracted);
      setSelected(new Set());
      setRandomCount((count) => Math.min(Math.max(1, count), extracted.length, 200));
    },
  });
  const importSelected = useMutation({
    mutationFn: () => api<Question[]>(`/api/v1/interviews/${templateId}/questions/import`, {
      method: "POST",
      body: JSON.stringify({ questions: Array.from(selected), time_limit_seconds: 180 }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["questions", templateId] });
      setQuestions((current) => current.filter((question) => !selected.has(question)));
      setSelected(new Set());
    },
  });

  function chooseRandom() {
    const shuffled = [...questions];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    setSelected(new Set(shuffled.slice(0, Math.min(randomCount, shuffled.length, 200))));
  }

  function chooseFile(nextFile: File | undefined) {
    setFileError("");
    setQuestions([]);
    setSelected(new Set());
    if (!nextFile) return setFile(null);
    if (nextFile.size > 5 * 1024 * 1024) {
      setFile(null);
      return setFileError("PDF must be 5 MB or smaller.");
    }
    if (nextFile.type && nextFile.type !== "application/pdf") {
      setFile(null);
      return setFileError("Choose a PDF file.");
    }
    setFile(nextFile);
  }

  return <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950/40 p-5">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div className="flex-1">
        <h3 className="font-semibold">Import questions from PDF</h3>
        <p className="mt-1 text-sm text-slate-400">Upload a text-based PDF up to 5 MB. The file is processed temporarily and is not stored.</p>
        <label className="mt-4 block"><span className="label">Question bank PDF</span><input key={templateId} className="input py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-400 file:px-3 file:py-1.5 file:font-semibold file:text-slate-950" type="file" accept="application/pdf,.pdf" onChange={(event) => chooseFile(event.target.files?.[0])} disabled={!templateId || published || extract.isPending} /></label>
      </div>
      <button className="button" type="button" onClick={() => extract.mutate()} disabled={!file || !templateId || published || extract.isPending}>{extract.isPending ? "Reading PDF…" : "Read questions"}</button>
    </div>
    {(fileError || extract.error) && <p role="alert" className="mt-3 text-sm text-rose-400">{fileError || errorMessage(extract.error)}</p>}
    {questions.length > 0 && <div className="mt-5">
      <div className="flex flex-wrap items-end gap-3">
        <label><span className="label">Random count</span><input className="input w-28" type="number" min="1" max={Math.min(questions.length, 200)} value={randomCount} onChange={(event) => setRandomCount(Math.min(200, Math.max(1, Number(event.target.value))))} /></label>
        <button className="button" type="button" onClick={chooseRandom}>Select random</button>
        <button className="button" type="button" onClick={() => importSelected.mutate()} disabled={!selected.size || importSelected.isPending}>{importSelected.isPending ? "Adding…" : `Add selected (${selected.size})`}</button>
        <span className="pb-3 text-sm text-slate-400">{questions.length} extracted</span>
      </div>
      {importSelected.error && <p role="alert" className="mt-3 text-sm text-rose-400">{errorMessage(importSelected.error)}</p>}
      <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
        {questions.map((question, index) => <label key={`${index}-${question}`} className="flex cursor-pointer gap-3 rounded-lg border border-slate-800 p-3 hover:border-slate-600">
          <input className="mt-1 size-4 accent-cyan-400" type="checkbox" checked={selected.has(question)} disabled={!selected.has(question) && selected.size >= 200} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(question)) next.delete(question); else next.add(question); return next; })} />
          <span className="text-sm"><span className="mr-2 text-slate-500">{index + 1}.</span>{question}</span>
        </label>)}
      </div>
    </div>}
  </div>;
}

function Company() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobSkills, setJobSkills] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateJobId, setTemplateJobId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [difficulty, setDifficulty] = useState("mixed");
  const [questionCount, setQuestionCount] = useState(3);
  const [editingQuestionId, setEditingQuestionId] = useState("");
  const [editingQuestionText, setEditingQuestionText] = useState("");
  const [editingQuestionTime, setEditingQuestionTime] = useState(180);
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [invitationMinimum] = useState(() => new Date());
  const [invitationExpiry, setInvitationExpiry] = useState(() => toLocalDateTimeInput(new Date(Date.now() + 72 * 60 * 60 * 1000)));
  const [sentInvitation, setSentInvitation] = useState<Invitation | null>(null);
  const company = useQuery({ queryKey: ["company"], queryFn: () => api<{ id: string; name: string }>("/api/v1/companies/me"), retry: false });
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => api<Job[]>("/api/v1/jobs"), enabled: company.isSuccess });
  const interviews = useQuery({ queryKey: ["interviews"], queryFn: () => api<Interview[]>("/api/v1/interviews"), enabled: company.isSuccess });
  const activeTemplateJobId = templateJobId || jobs.data?.[0]?.id || "";
  const activeTemplateId = selectedTemplateId || interviews.data?.[0]?.id || "";
  const selectedInterview = interviews.data?.find((interview) => interview.id === activeTemplateId);
  const expiryIsFuture = new Date(invitationExpiry).getTime() > invitationMinimum.getTime();
  const questions = useQuery({
    queryKey: ["questions", activeTemplateId],
    queryFn: () => api<Question[]>(`/api/v1/interviews/${activeTemplateId}/questions`),
    enabled: Boolean(activeTemplateId),
  });
  const bootstrap = useMutation({ mutationFn: () => api("/api/v1/companies", { method: "POST", body: JSON.stringify({ name }) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company"] }) });
  const createJob = useMutation({
    mutationFn: () => api<Job>("/api/v1/jobs", { method: "POST", body: JSON.stringify({ title: jobTitle, description: jobDescription, required_skills: jobSkills.split(",").map((skill) => skill.trim()).filter(Boolean) }) }),
    onSuccess: (job) => { setJobTitle(""); setJobDescription(""); setJobSkills(""); setTemplateJobId(job.id); queryClient.invalidateQueries({ queryKey: ["jobs"] }); },
  });
  const createInterview = useMutation({
    mutationFn: () => api<Interview>("/api/v1/interviews", { method: "POST", body: JSON.stringify({ job_id: activeTemplateJobId, name: templateName, duration_minutes: 30, attempt_limit: 1 }) }),
    onSuccess: (interview) => { setTemplateName(""); setSelectedTemplateId(interview.id); queryClient.invalidateQueries({ queryKey: ["interviews"] }); },
  });
  const generate = useMutation({
    mutationFn: () => api<Question[]>(`/api/v1/interviews/${activeTemplateId}/questions/generate`, { method: "POST", body: JSON.stringify({ count: questionCount, difficulty }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["questions", activeTemplateId] }),
  });
  const approve = useMutation({
    mutationFn: (questionId: string) => api(`/api/v1/questions/${questionId}/approve`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["questions", activeTemplateId] }),
  });
  const deselect = useMutation({
    mutationFn: (questionId: string) => api(`/api/v1/questions/${questionId}/deselect`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["questions", activeTemplateId] }),
  });
  const bulkApproval = useMutation({
    mutationFn: (approved: boolean) => api(`/api/v1/interviews/${activeTemplateId}/questions/approval`, { method: "POST", body: JSON.stringify({ approved }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["questions", activeTemplateId] }),
  });
  const publish = useMutation({
    mutationFn: () => api<Interview>(`/api/v1/interviews/${activeTemplateId}/publish`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["interviews"] }),
  });
  const revise = useMutation({
    mutationFn: () => api<Interview>(`/api/v1/interviews/${activeTemplateId}/revise`, { method: "POST" }),
    onSuccess: async (revision) => {
      setEditingQuestionId("");
      setSentInvitation(null);
      setSelectedTemplateId(revision.id);
      await queryClient.invalidateQueries({ queryKey: ["interviews"] });
    },
  });
  const editQuestion = useMutation({
    mutationFn: ({ id, text, time }: { id: string; text: string; time: number }) => api<Question>(`/api/v1/questions/${id}`, { method: "PATCH", body: JSON.stringify({ text, time_limit_seconds: time }) }),
    onSuccess: async () => {
      setEditingQuestionId("");
      await queryClient.invalidateQueries({ queryKey: ["questions", activeTemplateId] });
    },
  });
  const invite = useMutation({
    mutationFn: () => api<Invitation>("/api/v1/invitations", { method: "POST", body: JSON.stringify({ email: candidateEmail, name: candidateName || null, job_id: selectedInterview?.job_id, template_id: activeTemplateId, expires_at: new Date(invitationExpiry).toISOString() }) }),
    onSuccess: (invitation) => { setCandidateName(""); setCandidateEmail(""); setSentInvitation(invitation); setInvitationExpiry(toLocalDateTimeInput(new Date(invitation.expires_at))); },
  });
  const updateExpiry = useMutation({
    mutationFn: () => api<{ id: string; expires_at: string }>(`/api/v1/invitations/${sentInvitation?.id}`, { method: "PATCH", body: JSON.stringify({ expires_at: new Date(invitationExpiry).toISOString() }) }),
    onSuccess: (updated) => setSentInvitation((current) => current ? { ...current, expires_at: updated.expires_at } : current),
  });
  if (company.isError) return <Shell><div className="mb-8"><p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-400">Company portal</p><h1 className="mt-2 text-4xl font-bold">Set up your workspace</h1></div><section className="card max-w-lg"><h2 className="text-xl font-semibold">Create your company</h2><p className="my-3 text-sm text-slate-400">The signed-in user becomes the first administrator.</p><form onSubmit={(event) => { event.preventDefault(); bootstrap.mutate(); }} className="flex gap-3"><label className="sr-only" htmlFor="company-name">Company name</label><input id="company-name" className="input" value={name} onChange={(event) => setName(event.target.value)} minLength={2} required placeholder="Company name" /><button className="button" disabled={bootstrap.isPending}>Create</button></form>{bootstrap.error && <p className="mt-3 text-rose-400">{errorMessage(bootstrap.error)}</p>}</section></Shell>;

  return <Shell>
    <div className="mb-8"><p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-400">Company portal</p><h1 className="mt-2 text-4xl font-bold">{company.data?.name ?? "Loading workspace…"}</h1><p className="mt-2 text-slate-400">Create a role, generate a structured interview, approve it, and invite a candidate.</p></div>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card"><h2 className="text-xl font-semibold">1. Create a job</h2><form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); createJob.mutate(); }}><label className="block"><span className="label">Job title</span><input className="input" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} minLength={2} required /></label><label className="block"><span className="label">Description</span><textarea className="input min-h-28 py-3" value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} minLength={10} required /></label><label className="block"><span className="label">Skills, comma separated</span><input className="input" value={jobSkills} onChange={(event) => setJobSkills(event.target.value)} placeholder="Python, PostgreSQL" /></label><button className="button" disabled={createJob.isPending}>{createJob.isPending ? "Creating…" : "Create job"}</button>{createJob.error && <p role="alert" className="text-sm text-rose-400">{errorMessage(createJob.error)}</p>}</form></section>
      <section className="card"><h2 className="text-xl font-semibold">2. Create an interview</h2><form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); createInterview.mutate(); }}><label className="block"><span className="label">Job</span><select className="input" value={activeTemplateJobId} onChange={(event) => setTemplateJobId(event.target.value)} required><option value="">Select a job</option>{jobs.data?.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label><label className="block"><span className="label">Interview name</span><input className="input" value={templateName} onChange={(event) => setTemplateName(event.target.value)} minLength={2} required placeholder="Technical screen" /></label><button className="button" disabled={createInterview.isPending || !jobs.data?.length}>{createInterview.isPending ? "Creating…" : "Create interview"}</button>{createInterview.error && <p role="alert" className="text-sm text-rose-400">{errorMessage(createInterview.error)}</p>}</form></section>
    </div>
    <section id="questions" className="card mt-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="flex-1"><h2 className="text-xl font-semibold">3. Generate and approve questions</h2><label className="mt-4 block"><span className="label">Interview</span><select className="input" value={activeTemplateId} onChange={(event) => { setEditingQuestionId(""); setSentInvitation(null); setSelectedTemplateId(event.target.value); }}><option value="">Select an interview</option>{interviews.data?.map((interview) => <option key={interview.id} value={interview.id}>{interview.name}{interview.published ? " — published" : ""}</option>)}</select></label></div>
        <div className="flex flex-wrap gap-3"><label><span className="label">Difficulty</span><select className="input" value={difficulty} onChange={(event) => setDifficulty(event.target.value)} disabled={selectedInterview?.published}><option value="mixed">Mixed</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label><label><span className="label">Count</span><input className="input w-24" type="number" min="1" max="20" value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} disabled={selectedInterview?.published} /></label><button className="button self-end" onClick={() => generate.mutate()} disabled={!activeTemplateId || selectedInterview?.published || generate.isPending}>{generate.isPending ? "Generating…" : "Generate with AI"}</button></div>
      </div>
      {generate.error && <p role="alert" className="mt-4 text-sm text-rose-400">{errorMessage(generate.error)}</p>}
      {selectedInterview?.published && <div className="mt-5 flex flex-col justify-between gap-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 sm:flex-row sm:items-center"><div><p className="font-medium text-amber-200">This published interview is locked.</p><p className="mt-1 text-sm text-slate-400">Create an editable revision to change questions or generate more. Existing candidate assignments keep this published version.</p></div><button className="button shrink-0" type="button" onClick={() => revise.mutate()} disabled={revise.isPending}>{revise.isPending ? "Creating revision…" : "Create editable revision"}</button></div>}
      {revise.error && <p role="alert" className="mt-3 text-sm text-rose-400">{errorMessage(revise.error)}</p>}
      <PdfQuestionImporter key={activeTemplateId} templateId={activeTemplateId} published={Boolean(selectedInterview?.published)} />
      {Boolean(questions.data?.length) && <label className="mt-6 flex w-fit cursor-pointer items-center gap-3 font-medium"><input className="size-5 accent-cyan-400" type="checkbox" checked={questions.data?.every((question) => question.approved) ?? false} onChange={(event) => bulkApproval.mutate(event.target.checked)} disabled={selectedInterview?.published || bulkApproval.isPending} /><span>Select all questions</span><span className="text-sm font-normal text-slate-500">({questions.data?.filter((question) => question.approved).length}/{questions.data?.length} approved)</span></label>}
      <div className="mt-4 space-y-3">{questions.data?.map((question) => <article key={question.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><div className="flex items-start gap-4"><label className="flex flex-1 gap-4"><input className="mt-1 size-5 shrink-0 accent-cyan-400" type="checkbox" checked={question.approved} aria-label={`${question.approved ? "Deselect" : "Approve"} question: ${question.text}`} onChange={(event) => event.target.checked ? approve.mutate(question.id) : deselect.mutate(question.id)} disabled={selectedInterview?.published || approve.isPending || deselect.isPending || bulkApproval.isPending} /><span><span className="block text-xs font-semibold uppercase tracking-wide text-cyan-300">{String(question.rubric.competency ?? question.rubric.source ?? "Interview question")}</span><span className="mt-2 block">{question.text}</span><span className="mt-2 block text-xs text-slate-500">{question.time_limit_seconds}s · {question.approved ? "Approved" : "Awaiting approval"}</span></span></label>{!selectedInterview?.published && editingQuestionId !== question.id && <button className="text-sm font-medium text-cyan-300 hover:text-cyan-200" type="button" onClick={() => { setEditingQuestionId(question.id); setEditingQuestionText(question.text); setEditingQuestionTime(question.time_limit_seconds); }}>Edit</button>}</div>{editingQuestionId === question.id && <form className="mt-4 space-y-3 border-t border-slate-800 pt-4" onSubmit={(event) => { event.preventDefault(); editQuestion.mutate({ id: question.id, text: editingQuestionText, time: editingQuestionTime }); }}><label className="block"><span className="label">Question text</span><textarea className="input min-h-24 py-3" value={editingQuestionText} onChange={(event) => setEditingQuestionText(event.target.value)} minLength={5} maxLength={5000} required /></label><label className="block max-w-40"><span className="label">Time limit (seconds)</span><input className="input" type="number" min="30" max="3600" value={editingQuestionTime} onChange={(event) => setEditingQuestionTime(Number(event.target.value))} required /></label><div className="flex gap-3"><button className="button" disabled={editQuestion.isPending}>{editQuestion.isPending ? "Saving…" : "Save changes"}</button><button className="text-sm text-slate-400 hover:text-white" type="button" onClick={() => setEditingQuestionId("")}>Cancel</button></div><p className="text-xs text-slate-500">Edited questions require approval again.</p></form>}</article>)}{questions.isSuccess && !questions.data.length && <p className="text-slate-400">Generate with AI or import questions from a PDF.</p>}</div>
      {(approve.error || deselect.error || bulkApproval.error || editQuestion.error) && <p role="alert" className="mt-3 text-sm text-rose-400">{errorMessage(approve.error || deselect.error || bulkApproval.error || editQuestion.error)}</p>}
      {activeTemplateId && !selectedInterview?.published && <button className="button mt-5" onClick={() => publish.mutate()} disabled={publish.isPending || !questions.data?.some((question) => question.approved)}>{publish.isPending ? "Publishing…" : "Publish interview"}</button>}{publish.error && <p role="alert" className="mt-3 text-sm text-rose-400">{errorMessage(publish.error)}</p>}
    </section>
    <section id="invitations" className="card mt-6"><h2 className="text-xl font-semibold">4. Invite a candidate</h2><p className="mt-2 text-sm text-slate-400">Invitations are available after the selected interview is published.</p><form className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); invite.mutate(); }}><label><span className="label">Candidate name</span><input className="input" value={candidateName} onChange={(event) => setCandidateName(event.target.value)} /></label><label><span className="label">Candidate email</span><input className="input" type="email" value={candidateEmail} onChange={(event) => setCandidateEmail(event.target.value)} required /></label><label><span className="label">Invitation expires</span><input className="input" type="datetime-local" value={invitationExpiry} min={toLocalDateTimeInput(invitationMinimum)} onChange={(event) => setInvitationExpiry(event.target.value)} required /></label><button className="button self-end" disabled={!selectedInterview?.published || !expiryIsFuture || invite.isPending}>{invite.isPending ? "Sending…" : "Send invitation"}</button></form>{sentInvitation && <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300"><p>Invitation {sentInvitation.delivery_status}. It expires {new Date(sentInvitation.expires_at).toLocaleString()}.</p><button className="button mt-3" type="button" onClick={() => updateExpiry.mutate()} disabled={!expiryIsFuture || updateExpiry.isPending}>{updateExpiry.isPending ? "Updating…" : "Update expiry"}</button>{updateExpiry.isSuccess && <p className="mt-2 text-sm">Expiry updated. The existing invitation link remains valid.</p>}</div>}{invite.error && <p role="alert" className="mt-3 text-sm text-rose-400">{errorMessage(invite.error)}</p>}{updateExpiry.error && <p role="alert" className="mt-3 text-sm text-rose-400">{errorMessage(updateExpiry.error)}</p>}</section>
  </Shell>;
}

function Candidate() {
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api<Session[]>("/api/v1/sessions") });
  const start = useMutation({ mutationFn: (id: string) => api<{ id: string; attempt_number: number }>(`/api/v1/sessions/${id}/attempts`, { method: "POST" }) });
  return <Shell><p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-400">Candidate portal</p><h1 className="mt-2 text-4xl font-bold">Your interviews</h1><p className="mt-3 text-slate-400">Progress and deadlines are saved by the server. Refreshing never creates a new attempt.</p><div className="mt-8 grid gap-4">{sessions.data?.map((session) => <article className="card flex flex-col justify-between gap-4 sm:flex-row sm:items-center" key={session.id}><div><h2 className="font-semibold">Interview assignment</h2><p className="mt-1 text-sm text-slate-400">Available until {new Date(session.available_until).toLocaleString()}</p></div><button className="button" onClick={() => start.mutate(session.id)} disabled={start.isPending}>Start or resume</button></article>)}{sessions.isSuccess && !sessions.data.length && <div className="card text-slate-400">No interviews are assigned to this verified account.</div>}{sessions.error && <p role="alert" className="text-rose-400">{sessions.error.message}</p>}{start.data && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300">Attempt {start.data.attempt_number} is ready. Voice interview UI is scheduled for Phase 4.</p>}</div></Shell>;
}

function AcceptInvite({ token }: { token: string | null }) {
  const navigate = useNavigate();
  const acceptanceStarted = useRef(false);
  const [message, setMessage] = useState(token ? "Accepting your invitation…" : "Invitation token is missing.");
  useEffect(() => { if (!token || acceptanceStarted.current) return; acceptanceStarted.current = true; api("/api/v1/invitations/accept", { method: "POST", body: JSON.stringify({ token }) }).then(() => { clearPendingInvitationToken(localStorage); sessionStorage.removeItem("invite_token"); navigate("/candidate"); }).catch((error) => setMessage(errorMessage(error))); }, [token, navigate]);
  const failed = Boolean(token && message !== "Accepting your invitation…");
  return <main className="grid min-h-screen place-items-center px-6"><div className="card max-w-lg" role="status"><p>{message}</p>{failed && <><p className="mt-3 text-sm text-slate-400">Use the exact email address that received this invitation, or ask the company to send a new link if it expired.</p><button className="button mt-5" type="button" onClick={async () => { await supabase.auth.signOut(); navigate("/login"); }}>Sign out and try another account</button></>}</div></main>;
}

function InviteRoute({ signedIn }: { signedIn: boolean }) {
  const [token] = useState(() => {
    const pendingToken = captureInvitationToken(window.location.hash, localStorage);
    if (window.location.hash) window.history.replaceState({}, "", "/invite");
    return pendingToken;
  });
  return signedIn ? <AcceptInvite token={token} /> : <Navigate to="/login" replace />;
}

function App() {
  const [ready, setReady] = useState(hasE2ESession);
  const [signedIn, setSignedIn] = useState(hasE2ESession);
  useEffect(() => { if (hasE2ESession) return; supabase.auth.getSession().then(({ data }) => { setSignedIn(Boolean(data.session)); setReady(true); }); const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session))); return () => data.subscription.unsubscribe(); }, []);
  if (!ready) return <div className="grid min-h-screen place-items-center">Loading…</div>;
  return <Routes><Route path="/login" element={<Login />} /><Route path="/invite" element={<InviteRoute signedIn={signedIn} />} /><Route path="/company" element={signedIn ? <Company /> : <Navigate to="/login" replace />} /><Route path="/candidate" element={signedIn ? <Candidate /> : <Navigate to="/login?next=candidate" replace />} /><Route path="*" element={<Navigate to={signedIn ? "/company" : "/login"} replace />} /></Routes>;
}

export default App;
