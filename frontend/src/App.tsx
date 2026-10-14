import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { api, supabase } from "./lib";

type Session = { id: string; template_id: string; available_until: string };
type Job = { id: string; title: string; description: string; required_skills: string[] };
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen"><header className="border-b border-slate-800"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4"><Link to="/" className="text-xl font-bold tracking-tight">Interview<span className="text-cyan-400">OS</span></Link><button className="text-sm text-slate-300 hover:text-white" onClick={() => supabase.auth.signOut()}>Sign out</button></div></header><main className="mx-auto max-w-6xl px-6 py-10">{children}</main></div>;
}

function Login() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const submit = handleSubmit(async ({ email, password }) => {
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message); else navigate("/company");
  });
  return <main className="grid min-h-screen place-items-center px-6"><section className="card w-full max-w-md"><p className="mb-2 text-sm font-semibold uppercase tracking-[.2em] text-cyan-400">Secure access</p><h1 className="text-3xl font-bold">Welcome back</h1><p className="mt-2 text-slate-400">Use your verified company or candidate account.</p><form onSubmit={submit} className="mt-8 space-y-4"><label className="block"><span className="label">Email</span><input className="input" type="email" autoComplete="email" {...register("email")} />{errors.email && <small className="text-rose-400">{errors.email.message}</small>}</label><label className="block"><span className="label">Password</span><input className="input" type="password" autoComplete="current-password" {...register("password")} />{errors.password && <small className="text-rose-400">{errors.password.message}</small>}</label>{message && <p role="alert" className="text-sm text-rose-400">{message}</p>}<button className="button w-full" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign in"}</button></form><Link className="mt-6 block text-center text-sm text-cyan-300" to="/candidate">Candidate portal</Link></section></main>;
}

function Company() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const company = useQuery({ queryKey: ["company"], queryFn: () => api<{ id: string; name: string }>("/api/v1/companies/me"), retry: false });
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => api<Job[]>("/api/v1/jobs"), enabled: company.isSuccess });
  const bootstrap = useMutation({ mutationFn: () => api("/api/v1/companies", { method: "POST", body: JSON.stringify({ name }) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company"] }) });
  return <Shell><div className="mb-8"><p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-400">Company portal</p><h1 className="mt-2 text-4xl font-bold">{company.data?.name ?? "Set up your workspace"}</h1></div>{company.isError ? <section className="card max-w-lg"><h2 className="text-xl font-semibold">Create your company</h2><p className="my-3 text-sm text-slate-400">The signed-in user becomes the first administrator.</p><form onSubmit={(event) => { event.preventDefault(); bootstrap.mutate(); }} className="flex gap-3"><input className="input" value={name} onChange={(event) => setName(event.target.value)} minLength={2} required placeholder="Company name" /><button className="button" disabled={bootstrap.isPending}>Create</button></form>{bootstrap.error && <p className="mt-3 text-rose-400">{bootstrap.error.message}</p>}</section> : <section><div className="mb-5 flex items-center justify-between"><h2 className="text-2xl font-semibold">Jobs</h2><span className="rounded-full bg-slate-800 px-3 py-1 text-sm">{jobs.data?.length ?? 0} active</span></div><div className="grid gap-4 md:grid-cols-2">{jobs.data?.map((job) => <article className="card" key={job.id}><h3 className="text-lg font-semibold">{job.title}</h3><p className="mt-2 line-clamp-2 text-slate-400">{job.description}</p><div className="mt-4 flex flex-wrap gap-2">{job.required_skills.map((skill) => <span className="rounded-lg bg-cyan-400/10 px-2 py-1 text-xs text-cyan-300" key={skill}>{skill}</span>)}</div></article>)}{jobs.isSuccess && !jobs.data.length && <div className="card text-slate-400">No jobs yet. Use the documented API to create the first interview workflow.</div>}</div></section>}</Shell>;
}

function Candidate() {
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api<Session[]>("/api/v1/sessions") });
  const start = useMutation({ mutationFn: (id: string) => api<{ id: string; attempt_number: number }>(`/api/v1/sessions/${id}/attempts`, { method: "POST" }) });
  return <Shell><p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-400">Candidate portal</p><h1 className="mt-2 text-4xl font-bold">Your interviews</h1><p className="mt-3 text-slate-400">Progress and deadlines are saved by the server. Refreshing never creates a new attempt.</p><div className="mt-8 grid gap-4">{sessions.data?.map((session) => <article className="card flex flex-col justify-between gap-4 sm:flex-row sm:items-center" key={session.id}><div><h2 className="font-semibold">Interview assignment</h2><p className="mt-1 text-sm text-slate-400">Available until {new Date(session.available_until).toLocaleString()}</p></div><button className="button" onClick={() => start.mutate(session.id)} disabled={start.isPending}>Start or resume</button></article>)}{sessions.isSuccess && !sessions.data.length && <div className="card text-slate-400">No interviews are assigned to this verified account.</div>}{sessions.error && <p role="alert" className="text-rose-400">{sessions.error.message}</p>}{start.data && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300">Attempt {start.data.attempt_number} is ready. Voice interview UI is scheduled for Phase 4.</p>}</div></Shell>;
}

function AcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("Accepting your invitation…");
  useEffect(() => { const inviteToken = params.get("token"); if (!inviteToken) { setMessage("Invitation token is missing."); return; } api("/api/v1/invitations/accept", { method: "POST", body: JSON.stringify({ token: inviteToken }) }).then(() => navigate("/candidate")).catch((error) => setMessage(error.message)); }, [navigate, params]);
  return <main className="grid min-h-screen place-items-center"><div className="card" role="status">{message}</div></main>;
}

function App() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => { setSignedIn(Boolean(data.session)); setReady(true); }); const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session))); return () => data.subscription.unsubscribe(); }, []);
  if (!ready) return <div className="grid min-h-screen place-items-center">Loading…</div>;
  return <Routes><Route path="/login" element={<Login />} /><Route path="/invite" element={signedIn ? <AcceptInvite /> : <Navigate to="/login" replace />} /><Route path="/company" element={signedIn ? <Company /> : <Navigate to="/login" replace />} /><Route path="/candidate" element={signedIn ? <Candidate /> : <Navigate to="/login" replace />} /><Route path="*" element={<Navigate to={signedIn ? "/company" : "/login"} replace />} /></Routes>;
}

export default App;
