// Mock source/tailored resume data for the Smart Resume Tailoring reviewer.

export type RiskKind = "unsupported" | "missing" | "low_conf" | "gap";

export type RiskFlag = {
  id: string;
  kind: RiskKind;
  label: string;
  detail: string;
};

import { Flag, AlertTriangle, Zap, Tag, LucideIcon } from "lucide-react";

export const RISK_META: Record<RiskKind, { label: string; icon: LucideIcon; badgeClass: string }> =
  {
    unsupported: {
      label: "Unsupported",
      icon: Flag,
      badgeClass: "bg-destructive/15 text-destructive border-destructive/30",
    },
    missing: {
      label: "Missing",
      icon: AlertTriangle,
      badgeClass: "bg-warning/15 text-warning border-warning/30",
    },
    low_conf: {
      label: "Low Conf",
      icon: Zap,
      badgeClass: "bg-info/15 text-info border-info/30",
    },
    gap: {
      label: "Gaps",
      icon: Tag,
      badgeClass: "bg-muted text-muted-foreground border-border",
    },
  };

export const TAILORING_FLAGS: RiskFlag[] = [
  {
    id: "f1",
    kind: "unsupported",
    label: "AWS CKA Certification",
    detail:
      "Claim appears in the tailored draft but has no anchor in the source resume. Certifications cannot be inferred.",
  },
  {
    id: "f2",
    kind: "missing",
    label: "Terraform (required)",
    detail: "Requirement lists Terraform as mandatory; not found in source resume.",
  },
  {
    id: "f3",
    kind: "missing",
    label: "FedRAMP exposure",
    detail: "Preferred skill from the JD with no matching evidence in candidate history.",
  },
  {
    id: "f4",
    kind: "low_conf",
    label: "Team leadership scope",
    detail: "Source says 'collaborated with'; draft says 'led'. Downgraded to low confidence.",
  },
  {
    id: "f5",
    kind: "gap",
    label: "Employment gap: Mar 2022 – Sep 2022",
    detail: "6-month gap between Nimbus Labs and Contoso Cloud.",
  },
];

export const SOURCE_RESUME = `ARJUN MEHTA
Senior Platform Engineer — Austin, TX (Hybrid) — Green Card

SUMMARY
Platform engineer with 9 years building distributed backend services and
Kubernetes-based delivery platforms for fintech and healthcare workloads.

EXPERIENCE
Contoso Cloud — Senior Platform Engineer (Sep 2022 – Present)
- Designed multi-region EKS platform serving 240+ internal services.
- Cut p99 deploy time from 18m to 4m by rebuilding the CI graph.
- Collaborated with a team of 6 engineers on the platform roadmap.
- Owned Prometheus/Grafana observability stack and on-call rotation.

Nimbus Labs — Backend Engineer (Jun 2019 – Mar 2022)
- Built Go microservices handling 12k req/s at peak.
- Migrated batch pipelines from Airflow 1.x to 2.x.

Zenith Systems — Software Engineer (Jul 2016 – May 2019)
- Java/Spring services for claims adjudication.

SKILLS
Kubernetes, Docker, AWS (EKS, S3, IAM), Go, Python, Java, PostgreSQL,
Prometheus, Grafana, GitHub Actions, ArgoCD

EDUCATION
B.Tech, Computer Science — 2016`;

export const TAILORED_RESUME_WITH_CLAIM = `ARJUN MEHTA
Senior AI Platform Engineer — Austin, TX (Hybrid) — Green Card

PROFILE
Platform engineer (9 yrs) specializing in multi-region Kubernetes delivery
platforms, developer experience, and production observability for regulated
fintech and healthcare workloads.

CERTIFICATIONS
- AWS CKA Certification (2023)          <-- flagged: unsupported

KEY IMPACT
- Architected a multi-region Amazon EKS platform supporting 240+ services.
- Reduced p99 deployment latency 78% (18m → 4m) via CI graph redesign.
- Led a 6-engineer platform team on roadmap execution.   <-- low confidence
- Operated the Prometheus/Grafana observability stack and on-call program.

EXPERIENCE
Contoso Cloud — Senior Platform Engineer (Sep 2022 – Present)
Nimbus Labs — Backend Engineer (Jun 2019 – Mar 2022)
Zenith Systems — Software Engineer (Jul 2016 – May 2019)

CORE SKILLS
Kubernetes · EKS · Docker · ArgoCD · GitHub Actions · Go · Python · Java
PostgreSQL · Prometheus · Grafana · AWS IAM/S3`;

export const TAILORED_RESUME_CLEAN = TAILORED_RESUME_WITH_CLAIM.replace(
  `CERTIFICATIONS
- AWS CKA Certification (2023)          <-- flagged: unsupported

`,
  "",
);
