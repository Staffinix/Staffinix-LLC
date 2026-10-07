import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Crown, Building2, Code2, Users, ArrowRight, Check } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenancy } from "@/lib/tenancy.functions";

export const Route = createFileRoute("/_authenticated/architecture")({
  head: () => ({
    meta: [
      { title: "Platform Architecture — Staffinix" },
      {
        name: "description",
        content: "The four access levels of the Staffinix multi-tenant staffing platform.",
      },
      { property: "og:title", content: "Platform Architecture — Staffinix" },
      {
        property: "og:description",
        content: "Platform owner, company executive, developer and business user levels.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArchitecturePage,
});

const LEVELS = [
  {
    level: "Level 1",
    title: "Staffinix LLC — Platform Owner",
    icon: Crown,
    to: "/platform",
    accent: "from-amber-500/20 to-transparent border-amber-500/30",
    who: "SaaS super admins",
    capabilities: [
      "Provision and suspend tenant companies",
      "Manage plans, subscriptions and seat limits",
      "Global cross-tenant analytics",
      "Platform-wide audit visibility",
    ],
  },
  {
    level: "Level 2",
    title: "Company Executives — Tenant Admin",
    icon: Building2,
    to: "/company",
    accent: "from-sky-500/20 to-transparent border-sky-500/30",
    who: "Company owners, VPs, directors",
    capabilities: [
      "Company profile and branding",
      "Seat usage and role distribution",
      "Recruiter, client and vendor governance",
      "Company-wide performance reporting",
    ],
  },
  {
    level: "Level 3",
    title: "Developers & Integrators",
    icon: Code2,
    to: "/developer",
    accent: "from-violet-500/20 to-transparent border-violet-500/30",
    who: "Internal devs, client IT admins",
    capabilities: [
      "Scoped API keys with hashed secrets",
      "Outbound webhooks",
      "AI automation configuration",
      "Match-score thresholds and workflow rules",
    ],
  },
  {
    level: "Level 4",
    title: "Business Users",
    icon: Users,
    to: "/overview",
    accent: "from-emerald-500/20 to-transparent border-emerald-500/30",
    who: "Recruiters, bench sales, HR, account managers",
    capabilities: [
      "Requirements, candidates and bench",
      "AI matching and resume tailoring",
      "Submissions, interviews and placements",
      "AI copilot and daily workflow",
    ],
  },
];

function ArchitecturePage() {
  const fn = useServerFn(getTenancy);
  const { data } = useQuery({ queryKey: ["tenancy"], queryFn: () => fn() });

  return (
    <div className="space-y-6 p-8">
      <PageHeader
        title="Platform Architecture"
        description="Four levels of access across the Staffinix multi-tenant SaaS"
      />

      <Card className="border-border/60 bg-muted/20">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-sm">
          <span className="text-muted-foreground">Your context:</span>
          <span className="text-foreground">
            Company <strong>{data?.tenant?.name ?? "—"}</strong>
          </span>
          <Badge variant="outline" className="capitalize">
            {data?.tenant?.plan ?? "—"} plan
          </Badge>
          {data?.isPlatformStaff && (
            <Badge className="capitalize">{data.platformRole?.replace("_", " ")}</Badge>
          )}
          <div className="flex gap-1">
            {(data?.roles ?? []).map((r) => (
              <Badge key={r} variant="secondary" className="text-xs">
                {r.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {LEVELS.map((l) => {
          const Icon = l.icon;
          return (
            <Link key={l.level} to={l.to} className="group">
              <Card
                className={`h-full border bg-gradient-to-br ${l.accent} transition-colors hover:border-primary/40`}
              >
                <CardContent className="space-y-4 py-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-background/60 p-2.5">
                        <Icon className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-widest text-muted-foreground">
                          {l.level}
                        </p>
                        <h2 className="text-base font-semibold text-foreground">{l.title}</h2>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </div>
                  <p className="text-sm text-muted-foreground">{l.who}</p>
                  <ul className="space-y-1.5">
                    {l.capabilities.map((c) => (
                      <li key={c} className="flex items-start gap-2 text-sm text-foreground/90">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent className="py-6">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Data isolation model</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Every business record carries a company identifier. Database-level access rules enforce
            that a signed-in user can only reach rows belonging to their own company — the check
            runs on the server for every single query, so it cannot be bypassed from the browser or
            the API. Platform staff at Level 1 are the only identities able to read across
            companies, and every one of their actions is written to the audit trail.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
