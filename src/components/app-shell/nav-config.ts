import {
  Building2,
  CalendarClock,
  Code2,
  Crown,
  FileText,
  Handshake,
  KanbanSquare,
  MailSearch,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  Users,
  UsersRound,
  Wand2,
} from "lucide-react";
import type { ComponentType } from "react";

import type { Feature } from "@/lib/feature-access";

export type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  feature: Feature;
};

export const NAV_GROUPS: ReadonlyArray<{ section: string; items: readonly NavItem[] }> = [
  {
    section: "Workspace",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, feature: "dashboard" }],
  },
  {
    section: "Talent Operations",
    items: [
      { to: "/requirements", label: "Requisitions", icon: FileText, feature: "requirements" },
      { to: "/candidates", label: "Candidates", icon: Users, feature: "candidates" },
      { to: "/matching", label: "AI Matching", icon: Sparkles, feature: "matching" },
      { to: "/tailoring", label: "Resume Tailoring", icon: Wand2, feature: "tailoring" },
      {
        to: "/submissions/board",
        label: "Pipeline Tracker",
        icon: KanbanSquare,
        feature: "submissions",
      },
      { to: "/interviews", label: "Interviews", icon: CalendarClock, feature: "interviews" },
      {
        to: "/email-intelligence",
        label: "Smart Email",
        icon: MailSearch,
        feature: "email_intelligence",
      },
    ],
  },
  {
    section: "Relationships & Delivery",
    items: [
      { to: "/clients", label: "Client Accounts", icon: Building2, feature: "clients" },
      { to: "/vendors", label: "Vendors", icon: Handshake, feature: "vendors" },
      { to: "/placements", label: "Placements & Revenue", icon: Trophy, feature: "placements" },
      { to: "/recruiters", label: "Recruiter Team", icon: UsersRound, feature: "recruiters" },
    ],
  },
  {
    section: "Administration",
    items: [
      { to: "/users", label: "Company Team", icon: UserRound, feature: "users" },
      { to: "/audit", label: "Audit Logs", icon: ScrollText, feature: "audit" },
      { to: "/developer", label: "Dev Console & APIs", icon: Code2, feature: "developer" },
      { to: "/architecture", label: "Architecture", icon: ShieldCheck, feature: "developer" },
    ],
  },
  {
    section: "SaaS Administration",
    items: [
      { to: "/platform", label: "Platform Console", icon: Crown, feature: "platform" },
      {
        to: "/tenants/new",
        label: "New Tenant Registration",
        icon: Building2,
        feature: "platform",
      },
    ],
  },
];
