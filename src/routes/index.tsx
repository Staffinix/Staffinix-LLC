import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  Clock,
  Layers,
  Lock,
  Mail,
  Menu,
  MessageCircle,
  PlayCircle,
  Shield,
  Sparkles,
  X,
  Loader2,
} from "lucide-react";
import { StaffinixLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { submitContactUs } from "@/lib/contact-us.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Staffinix AI — Double Your Submissions, Zero Resume Hallucinations" },
      {
        name: "description",
        content:
          "The AI recruitment engine built for US IT staffing. Parse requirements in seconds, match bench talent instantly, and generate 100% truthful tailored submissions.",
      },
      { property: "og:title", content: "Staffinix AI — AI Recruitment Engine for US IT Staffing" },
      {
        property: "og:description",
        content:
          "Parse requirements in seconds, match bench talent instantly, and ship anti-fabrication verified submissions.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://staffbridge-ai.lovable.app/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://staffbridge-ai.lovable.app/" }],
  }),
  component: LandingPage,
});

const NAV = [
  { id: "features", label: "Features" },
  { id: "workflow", label: "Workflow" },
  { id: "faqs", label: "FAQs" },
  { id: "pricing", label: "Pricing" },
  { id: "contact", label: "Contact us" },
];

const STATS = [
  { value: "3.5×", label: "Faster submissions" },
  { value: "99.4%", label: "Extraction accuracy" },
  { value: "$0", label: "Margin loss" },
];

const FEATURES = [
  {
    icon: Clock,
    tag: "Speed",
    title: "30-Minute Time-to-Submit",
    body: "Automated email intake, instant 13-field JD parsing, and hybrid vector + weighted candidate matching. From inbox to submission-ready in under half an hour.",
    metric: "18 min",
    metricLabel: "avg time-to-submit",
  },
  {
    icon: Shield,
    tag: "Accuracy",
    title: "Zero Fabrication Guarantee",
    body: "A 3-layer consistency checker verifies every generated claim against source resume anchors. Unsupported claims block approval until resolved.",
    metric: "0",
    metricLabel: "hallucinated facts approved",
  },
  {
    icon: Lock,
    tag: "Safety",
    title: "100% Draft-Only Safety",
    body: "OAuth-protected draft generation in Outlook & Gmail. No auto-sending, no scraping, no unauthorized access. Recruiters retain control over every outbound.",
    metric: "0",
    metricLabel: "auto-sent emails — ever",
  },
];

const WORKFLOW = [
  { n: "01", title: "Ingest", body: "Email / Upload / Paste" },
  { n: "02", title: "Parse & Validate", body: "13-field smart schema" },
  { n: "03", title: "Match", body: "Vector + visa + scoring" },
  { n: "04", title: "Tailor & Verify", body: "Anchor consistency gate" },
  { n: "05", title: "Draft & Submit", body: "Outlook / Gmail draft" },
];

const FAQS = [
  {
    q: "What exactly does Staffinix automate?",
    a: "Staffinix covers the recruiter desk end to end: requirement intake and parsing, bench and pipeline matching, resume tailoring with anti-fabrication checks, submission tracking, interview scheduling and placement records — all with a full audit trail.",
  },
  {
    q: "How do you prevent the AI from inventing candidate experience?",
    a: "Every tailored line must map to a source anchor in the original resume. Claims without an anchor are flagged as unsupported and the approval button stays disabled until a recruiter removes or resolves them.",
  },
  {
    q: "Is my client and candidate data isolated?",
    a: "Yes. Staffinix is multi-tenant with row-level security. Each company's requirements, candidates, submissions and documents are scoped to its own tenant, and privileged operations are role gated.",
  },
  {
    q: "Which roles are supported?",
    a: "Four tiers: platform owner, company executive/admin, delivery manager and recruiter. Navigation, data access and console visibility all adapt to the signed-in user's role.",
  },
  {
    q: "Does it work for W2, C2C and 1099 hiring?",
    a: "It does. Rate types, visa status, work mode and compliance fields are first-class, so US IT staffing models are supported out of the box.",
  },
  {
    q: "Can we integrate with our own systems?",
    a: "Yes — the developer console issues API keys and webhook settings so your team can push requirements in and pull submissions out programmatically.",
  },
];

const PRICING = [
  {
    name: "Starter",
    price: "$99",
    period: "/recruiter / mo",
    body: "For lean desks getting off spreadsheets.",
    perks: ["Up to 3 recruiters", "JD + resume parsing", "AI matching", "Email support"],
  },
  {
    name: "Growth",
    price: "$249",
    period: "/recruiter / mo",
    body: "For scaling staffing teams running a live bench.",
    perks: [
      "Unlimited requisitions",
      "Anti-fabrication tailoring gate",
      "Pipeline board + interviews",
      "Outlook & Gmail drafts",
      "Priority support",
    ],
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    body: "Multi-tenant governance for staffing groups.",
    perks: ["Multi-tenant console", "API keys & webhooks", "Audit log exports", "SSO & custom SLA"],
  },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="shrink-0">
            <StaffinixLogo />
          </Link>

          <nav className="mx-auto hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <ThemeToggle />
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
              <Link to="/auth">Log in</Link>
            </Button>
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link to="/auth">
                Sign up free <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-border bg-background px-4 py-3 md:hidden">
            <div className="flex flex-col gap-1">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setMenuOpen(false);
                    scrollTo(item.id);
                  }}
                  className="rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {item.label}
                </button>
              ))}
              <div className="mt-2 flex gap-2">
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link to="/auth">Log in</Link>
                </Button>
                <Button asChild size="sm" className="flex-1">
                  <Link to="/auth">Sign up free</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="bg-grid absolute inset-0 opacity-60" />
        <div className="absolute left-1/2 top-[-10rem] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />

        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
          <Badge
            variant="outline"
            className="mb-7 gap-1.5 rounded-full border-primary/30 bg-primary/10 px-3 py-1 text-primary"
          >
            <Sparkles className="h-3.5 w-3.5" />
            #1 AI Recruitment Engine for US IT Staffing
          </Badge>

          <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Double Your Submissions.
            <br />
            <span className="text-brand-gradient">Zero Resume Hallucinations.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            The AI recruitment operating system built for US IT staffing. Parse requirements in
            seconds, match bench talent instantly, and generate 100% truthful tailored submissions
            straight into your mailbox.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="shadow-lg transition-all duration-200 hover:scale-[1.02]"
            >
              <Link to="/auth">
                Start 14-day free trial <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => scrollTo("workflow")}
              className="transition-all duration-200"
            >
              <PlayCircle className="mr-1.5 h-4 w-4" /> See the 30-min workflow
            </Button>
          </div>

          <ProductPreview />
        </div>
      </section>

      {/* ---------- Trust + stats ---------- */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {[
            "Built for W2, C2C & 1099 IT hiring",
            "Outlook & Gmail native",
            "SOC2-ready controls",
          ].map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-muted-foreground"
            >
              <Shield className="h-3.5 w-3.5 text-primary" />
              {t}
            </span>
          ))}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {STATS.map((s) => (
            <Card
              key={s.label}
              className="border-border bg-card text-center transition-all duration-200 hover:border-primary/40"
            >
              <CardContent className="py-8">
                <p className="text-4xl font-semibold tracking-tight text-primary">{s.value}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section id="features" className="scroll-mt-20 border-t border-border bg-surface/40 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything you need to <span className="text-brand-gradient">submit faster</span>
            </h2>
            <p className="mt-3 text-muted-foreground">
              Purpose-built for US IT staffing agencies. No fluff, no bloat — just velocity.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <Card
                  key={f.title}
                  className="group border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
                >
                  <CardContent className="flex h-full flex-col p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                        {f.tag}
                      </Badge>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                    <div className="mt-6 border-t border-border pt-4 text-sm">
                      <span className="font-semibold text-primary">{f.metric}</span>{" "}
                      <span className="text-muted-foreground">{f.metricLabel}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <Card className="border-border bg-card">
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold">Where submissions come from</h3>
                <div className="mt-5 space-y-4">
                  {[
                    { label: "Direct AI match", value: 45 },
                    { label: "LinkedIn sourcing", value: 30 },
                    { label: "Internal bench pool", value: 15 },
                    { label: "Partner agencies", value: 10 },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="mb-1.5 flex justify-between text-xs">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="font-medium">{row.value}%</span>
                      </div>
                      <Progress value={row.value} className="h-1.5" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold">Built for every tier of your org</h3>
                <ul className="mt-5 space-y-3 text-sm">
                  {[
                    "Platform owners — multi-tenant governance and global audit",
                    "Executives — ROI, margin and delivery dashboards",
                    "Delivery managers — team workload and onboarding",
                    "Recruiters — requisitions, bench, tailoring and pipeline",
                  ].map((t) => (
                    <li key={t} className="flex gap-2.5">
                      <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-muted-foreground">{t}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ---------- Workflow ---------- */}
      <section id="workflow" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Card className="border-border bg-card">
            <CardContent className="px-6 py-12">
              <div className="text-center">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  The 30-Minute Workflow
                </h2>
                <p className="mt-3 text-muted-foreground">
                  From raw job email to approved submission — fully auditable.
                </p>
              </div>

              <div className="mt-12 grid gap-8 sm:grid-cols-3 lg:grid-cols-5">
                {WORKFLOW.map((step) => (
                  <div key={step.n} className="flex flex-col items-center text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-mono text-sm font-semibold text-primary">
                      {step.n}
                    </div>
                    <p className="mt-4 text-sm font-semibold">{step.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{step.body}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ---------- FAQs ---------- */}
      <section id="faqs" className="scroll-mt-20 border-t border-border bg-surface/40 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Frequently asked questions
            </h2>
            <p className="mt-3 text-muted-foreground">
              Everything staffing leaders ask before rolling Staffinix out to a desk.
            </p>
          </div>

          <Accordion type="single" collapsible className="mt-10">
            {FAQS.map((f) => (
              <AccordionItem key={f.q} value={f.q}>
                <AccordionTrigger className="text-left text-sm font-medium">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ---------- Pricing ---------- */}
      <section id="pricing" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Simple, per-recruiter pricing
            </h2>
            <p className="mt-3 text-muted-foreground">
              Every plan includes the anti-fabrication gate. Cancel anytime.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {PRICING.map((p) => (
              <Card
                key={p.name}
                className={cn(
                  "relative border-border bg-card transition-all duration-200 hover:-translate-y-1",
                  p.featured && "border-primary/50 shadow-lg",
                )}
              >
                {p.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                    Most popular
                  </span>
                )}
                <CardContent className="flex h-full flex-col p-6">
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="mt-3">
                    <span className="text-3xl font-semibold tracking-tight">{p.price}</span>
                    <span className="text-xs text-muted-foreground">{p.period}</span>
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    {p.perks.map((perk) => (
                      <li key={perk} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="text-muted-foreground">{perk}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    className="mt-6 w-full"
                    variant={p.featured ? "default" : "outline"}
                  >
                    <Link to="/auth">
                      {p.price === "Custom" ? "Talk to sales" : "Start free trial"}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Contact us ---------- */}
      <section id="contact" className="scroll-mt-20 border-t border-border bg-surface/40 py-20">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              Contact us
            </Badge>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              Let&apos;s build a faster recruiting desk.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Tell us what your staffing team needs. We&apos;ll follow up to discuss your workflow,
              implementation, and the right Staffinix plan.
            </p>
            <a
              href="mailto:hello@staffinix.ai"
              className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <Mail className="h-4 w-4" /> hello@staffinix.ai
            </a>
          </div>

          <Card className="border-border bg-card">
            <CardContent className="p-6 sm:p-8">
              <ContactUsForm />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-primary/30 bg-primary/10 px-6 py-14 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            Ready to double your submissions?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Spin up your workspace in minutes — no credit card, no migration project.
          </p>
          <Button asChild size="lg" className="mt-7">
            <Link to="/auth">
              Create your workspace <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-border bg-surface/40">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-1">
              <StaffinixLogo />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                The AI recruitment operating system for US IT staffing — truthful submissions,
                auditable end to end.
              </p>
              <a
                href="mailto:hello@staffinix.ai"
                className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <Mail className="h-3.5 w-3.5" /> hello@staffinix.ai
              </a>
            </div>

            <FooterCol title="Product" links={NAV.map((n) => ({ label: n.label, id: n.id }))} />
            <FooterCol
              title="Platform"
              links={[
                { label: "AI matching engine", id: "features" },
                { label: "Resume tailoring gate", id: "features" },
                { label: "Submissions pipeline", id: "workflow" },
                { label: "Multi-tenant governance", id: "features" },
              ]}
            />

            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Account
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <Link
                    to="/auth"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Log in
                  </Link>
                </li>
                <li>
                  <Link
                    to="/auth"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Create account
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
            <p>© {new Date().getFullYear()} Staffinix LLC · Enterprise Edition</p>
            <p>Draft-only AI · Anti-fabrication verified · Tenant-isolated data</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; id: string }[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map((l) => (
          <li key={l.label}>
            <button
              onClick={() => scrollTo(l.id)}
              className="text-left text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContactUsForm() {
  const submitContactUsFn = useServerFn(submitContactUs);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    try {
      await submitContactUsFn({
        data: { name, phoneNumber, email, description, website },
      });
      setName("");
      setPhoneNumber("");
      setEmail("");
      setDescription("");
      setWebsite("");
      toast.success("Thanks — your message has been sent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We could not send your message.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessageCircle className="h-4 w-4 text-primary" /> Tell us how we can help
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="contact-name">Name</Label>
          <Input
            id="contact-name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={loading}
            required
            maxLength={120}
            placeholder="Your name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-phone">Phone number</Label>
          <Input
            id="contact-phone"
            name="tel"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            disabled={loading}
            required
            maxLength={30}
            placeholder="+91 98765 43210"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-email">Email</Label>
        <Input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={loading}
          required
          maxLength={254}
          placeholder="you@company.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-description">Description</Label>
        <Textarea
          id="contact-description"
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={loading}
          required
          minLength={10}
          maxLength={2000}
          rows={5}
          placeholder="Tell us how we can help."
        />
      </div>
      <div
        className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
        aria-hidden="true"
      >
        <Label htmlFor="contact-website">Website</Label>
        <Input
          id="contact-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full sm:w-auto">
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {loading ? "Sending..." : "Send message"}
      </Button>
    </form>
  );
}

/** Static product screenshot mock rendered from design tokens. */
function ProductPreview() {
  return (
    <div className="mt-14 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        <span className="mx-auto rounded-md border border-border bg-background px-3 py-0.5 font-mono text-[11px] text-muted-foreground">
          staffinix.ai/live-preview
        </span>
      </div>

      <div className="grid gap-0 text-left md:grid-cols-2">
        <div className="border-b border-border p-5 md:border-b-0 md:border-r">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <Mail className="h-3.5 w-3.5" /> Inbound email intake
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            From: <span className="font-medium text-foreground">anil.k@primevendor.com</span>
          </p>
          <p className="mt-1 text-sm font-semibold text-primary">Urgent: Sr. DevOps Engineer</p>
          <div className="mt-4 space-y-1.5 rounded-lg border border-border bg-background p-4 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Location:</span> Charlotte, NC — Hybrid
            </p>
            <p>
              <span className="font-medium text-foreground">Visa:</span> USC, GC, GC-EAD only
            </p>
            <p>
              <span className="font-medium text-foreground">Skills:</span> AWS, EKS, Terraform,
              CI/CD
            </p>
            <p>
              <span className="font-medium text-foreground">Rate:</span> [Not stated]
            </p>
          </div>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <Layers className="h-3.5 w-3.5" /> AI match output
            </p>
            <Badge className="bg-success/15 text-success hover:bg-success/15">
              ✓ Anti-fabrication passed
            </Badge>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-primary-foreground">
              98%
            </div>
            <div>
              <p className="text-sm font-semibold">Alex Mercer</p>
              <p className="text-xs text-muted-foreground">
                GC-EAD · Available · <span className="text-primary">Top match</span>
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {[
              { label: "Skills alignment", value: 96 },
              { label: "Experience depth", value: 90 },
              { label: "Visa & compliance", value: 100 },
            ].map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex justify-between text-[11px]">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-medium">{r.value}%</span>
                </div>
                <Progress value={r.value} className="h-1.5" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
        <span>Parsed in 1.2s · PII masked · Draft-only safety</span>
        <Button asChild size="sm" variant="secondary">
          <Link to="/auth">
            See full workflow <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
