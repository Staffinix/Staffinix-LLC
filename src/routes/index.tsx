import { createFileRoute, Link } from "@tanstack/react-router";
import { ROLE_LEVEL_LABELS } from "@/lib/role-presentation";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowRight, Check, Loader2, Mail, Menu, X } from "lucide-react";
import { StaffinixLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { submitContactUs } from "@/lib/contact-us.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Staffinix — Recruiting desk for US IT staffing teams" },
      {
        name: "description",
        content:
          "Read requirements from mail, match your bench, and tailor resumes using only facts from each candidate's verified record.",
      },
      { property: "og:title", content: "Staffinix — Recruiting desk for US IT staffing teams" },
      {
        property: "og:description",
        content:
          "From job email to a recruiter-approved resume, with every claim traced to the candidate's verified record.",
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

const FEATURES = [
  {
    title: "Requirements arrive from mail",
    body: "Connect Gmail or Outlook and matching job emails become requirements, with the sender's name and address kept on the record.",
  },
  {
    title: "Resumes stay true to the source",
    body: "AI only chooses which verified facts to include. The resume is rendered from the stored record, so it cannot add a skill or job the candidate never had.",
  },
  {
    title: "A recruiter approves every version",
    body: "Each tailored resume stays a draft until someone reviews it. Approved versions are locked, and nothing is sent to a client automatically.",
  },
];

const WORKFLOW = [
  { title: "Receive", body: "Mail, upload or paste" },
  { title: "Parse", body: "Skills, visa, rate and location" },
  { title: "Match", body: "Bench ranked against the role" },
  { title: "Tailor", body: "Verified facts only" },
  { title: "Submit", body: "Approved version, tracked" },
];

const FAQS = [
  {
    q: "What exactly does Staffinix automate?",
    a: "Staffinix covers the recruiter desk: requirement intake and parsing, bench matching, fact-preserving resume tailoring, submission tracking, interview scheduling and placement records, with an audit trail.",
  },
  {
    q: "How do you prevent the AI from inventing candidate experience?",
    a: "The AI can only select existing records from the candidate's verified profile. The server renders those stored values as written, rejects unknown records, and a recruiter must approve the result.",
  },
  {
    q: "Is my client and candidate data isolated?",
    a: "Yes. Staffinix is multi-tenant with row-level security. Each company's requirements, candidates, submissions and documents are scoped to its own tenant, and privileged operations are role gated.",
  },
  {
    q: "Which roles are supported?",
    a: `Four tiers: ${Object.values(ROLE_LEVEL_LABELS).join(", ")}. Navigation, data access and console visibility adapt to the signed-in user's stored permissions.`,
  },
  {
    q: "Does it work for W2, C2C and 1099 hiring?",
    a: "It does. Rate types, visa status, work mode and compliance fields are part of every record.",
  },
  {
    q: "Can we integrate with our own systems?",
    a: "Yes. The developer console manages API keys and webhook settings for your team.",
  },
];

const PRICING = [
  {
    name: "Starter",
    price: "$99",
    period: "per recruiter / month",
    body: "For lean desks getting off spreadsheets",
    perks: ["Up to 3 recruiters", "Requirement and resume parsing", "AI matching", "Email support"],
  },
  {
    name: "Growth",
    price: "$249",
    period: "per recruiter / month",
    body: "For staffing teams running a live bench",
    perks: [
      "Unlimited requirements",
      "Fact-preserving tailoring",
      "Pipeline board and interviews",
      "Outlook and Gmail intake",
      "Priority support",
    ],
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    body: "Governance for staffing groups",
    perks: [
      "Multi-tenant console",
      "API keys and webhooks",
      "Audit log exports",
      "SSO and custom SLA",
    ],
  },
];

const SAMPLE_CLAIMS = [
  { claim: "AWS, EKS", source: "Skills" },
  { claim: "Terraform", source: "Skills" },
  { claim: "Platform Engineer, 2021 to present", source: "Employment" },
  { claim: "GC-EAD", source: "Profile" },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const sectionTitle = "text-2xl font-medium tracking-tight sm:text-3xl";

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="shrink-0">
            <StaffinixLogo />
          </Link>

          <nav className="mx-auto hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <ThemeToggle />
            <Link
              to="/auth"
              className="hidden px-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Log in
            </Link>
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link to="/auth">Sign up free</Link>
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

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[5fr_6fr] lg:py-20">
        <div>
          <h1 className="text-balance text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl">
            From job email to a resume you can stand behind
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            Staffinix is the recruiting desk for US IT staffing teams. Read requirements from mail,
            match your bench, and tailor resumes using only facts from the candidate&apos;s verified
            record.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/auth">
                Start 14-day free trial <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" onClick={() => scrollTo("workflow")}>
              See the workflow
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">Built for W2, C2C and 1099 IT hiring</p>
        </div>

        <ProductPreview />
      </section>

      <section id="features" className="scroll-mt-16 border-t border-border py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[5fr_6fr] lg:gap-12">
          <div>
            <h2 className={sectionTitle}>Faster submissions, with the facts intact</h2>
            <p className="mt-3 max-w-md text-muted-foreground">
              Every step keeps a person in charge and a record of what happened.
            </p>
          </div>

          <div className="divide-y divide-border border-y border-border">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="py-6">
                <h3 className="font-medium">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
          <h3 className="font-medium">Built for every level of your team</h3>
          <dl className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["L1", "Multi-tenant governance and global audit"],
                ["L2", "Company administration and team workload"],
                ["L3", "Integrations and developer tools"],
                ["L4", "Requirements, bench, tailoring and pipeline"],
              ] as const
            ).map(([level, description]) => (
              <div key={level}>
                <dt className="text-sm font-medium">{ROLE_LEVEL_LABELS[level]}</dt>
                <dd className="mt-1 text-sm leading-6 text-muted-foreground">{description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="workflow" className="scroll-mt-16 border-t border-border py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className={sectionTitle}>How a requirement moves through the desk</h2>
          <p className="mt-3 text-muted-foreground">From raw job email to approved submission</p>

          <ol className="mt-10 grid gap-6 sm:grid-cols-3 lg:grid-cols-5 lg:gap-0">
            {WORKFLOW.map((step, index) => (
              <li key={step.title} className="border-t border-border-strong pt-4 lg:pr-6">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <p className="mt-2 text-sm font-medium">{step.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="faqs" className="scroll-mt-16 border-t border-border py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[5fr_6fr] lg:gap-12">
          <h2 className={sectionTitle}>Frequently asked questions</h2>

          <Accordion type="single" collapsible>
            {FAQS.map((f) => (
              <AccordionItem key={f.q} value={f.q}>
                <AccordionTrigger className="text-left text-sm font-medium">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm leading-6 text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-16 border-t border-border py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className={sectionTitle}>Per-recruiter pricing</h2>
          <p className="mt-3 text-muted-foreground">Fact-preserving tailoring on every plan</p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PRICING.map((p) => (
              <Card key={p.name} className={cn(p.featured && "border-primary")}>
                <CardContent className="flex h-full flex-col p-6">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-medium tabular-nums tracking-tight">
                      {p.price}
                    </span>
                    <span className="text-xs text-muted-foreground">{p.period}</span>
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
                  <ul className="mt-6 flex-1 space-y-2 text-sm">
                    {p.perks.map((perk) => (
                      <li key={perk} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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

      <section id="contact" className="scroll-mt-16 border-t border-border py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[5fr_6fr] lg:gap-12">
          <div>
            <h2 className={sectionTitle}>Tell us how your desk works</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
              We&apos;ll follow up to discuss your workflow, implementation and the right plan.
            </p>
            <a
              href="mailto:hello@staffinix.ai"
              className="mt-6 inline-flex items-center gap-2 text-sm text-foreground underline-offset-4 hover:underline"
            >
              <Mail className="h-4 w-4 text-muted-foreground" /> hello@staffinix.ai
            </a>
          </div>

          <Card>
            <CardContent className="p-6">
              <ContactUsForm />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-t border-border py-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-2xl font-medium tracking-tight">Put your next requirement on it</h2>
            <p className="mt-2 text-muted-foreground">Create a workspace and add your bench</p>
          </div>
          <Button asChild size="lg">
            <Link to="/auth">
              Create your workspace <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid gap-10 md:grid-cols-4">
            <div>
              <StaffinixLogo />
              <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
                The recruiting desk for US IT staffing teams
              </p>
              <a
                href="mailto:hello@staffinix.ai"
                className="mt-3 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                hello@staffinix.ai
              </a>
            </div>

            <FooterCol title="Product" links={NAV.map((n) => ({ label: n.label, id: n.id }))} />
            <FooterCol
              title="Platform"
              links={[
                { label: "AI matching", id: "features" },
                { label: "Resume tailoring", id: "features" },
                { label: "Submissions pipeline", id: "workflow" },
                { label: "Multi-tenant governance", id: "features" },
              ]}
            />

            <div>
              <p className="text-sm font-medium">Account</p>
              <ul className="mt-4 space-y-2 text-sm">
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

          <p className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
            © {new Date().getFullYear()} Staffinix LLC
          </p>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; id: string }[] }) {
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-4 space-y-2 text-sm">
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
      toast.success("Message sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We could not send your message.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
          placeholder="Team size, roles you hire for, current tools"
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
        {loading ? "Sending" : "Send message"}
      </Button>
    </form>
  );
}

/** Sample record showing how a tailored resume traces each claim to its source. */
function ProductPreview() {
  return (
    <figure className="overflow-hidden rounded-xl border border-border-strong bg-card">
      <figcaption className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 text-xs text-muted-foreground">
        <span>Sample tailoring record</span>
        <span className="font-mono">Version 3</span>
      </figcaption>

      <div className="border-b border-border px-5 py-4">
        <p className="text-xs text-muted-foreground">From anil.k@primevendor.com</p>
        <p className="mt-1 font-medium">Sr. DevOps Engineer</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Charlotte, NC · Hybrid · USC, GC, GC-EAD
        </p>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="font-medium">Alex Mercer</p>
          <p className="text-xs text-muted-foreground">Claim and where it came from</p>
        </div>
        <ul className="mt-3 divide-y divide-border">
          {SAMPLE_CLAIMS.map((item) => (
            <li key={item.claim} className="flex h-10 items-center gap-3 text-sm">
              <Check className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">{item.claim}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {item.source}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border bg-surface-2 px-5 py-3 text-sm">
        <span className="text-muted-foreground">4 of 4 claims verified</span>
        <span className="font-medium">Ready for review</span>
      </div>
    </figure>
  );
}
