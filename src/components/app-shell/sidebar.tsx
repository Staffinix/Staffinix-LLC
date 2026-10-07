import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Crown, ShieldCheck, UserRound } from "lucide-react";
import { StaffinixLogo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/use-profile";
import { useTenancy } from "@/hooks/use-tenancy";
import { canAccessFeature, type FeatureAccessIdentity } from "@/lib/feature-access";
import { NAV_GROUPS, type NavItem } from "@/components/app-shell/nav-config";

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data } = useProfile();
  const { data: tenancy } = useTenancy();
  const level = data?.level ?? null;
  const identity: FeatureAccessIdentity = {
    roles: data?.roles ?? [],
    platformRole: data?.platformRole ?? null,
  };
  const currentNavGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccessFeature(identity, item.feature)),
  })).filter((group) => group.items.length > 0);
  const isPlatformApprover =
    data?.platformRole === "platform_owner" || data?.platformRole === "platform_admin";
  const isUnprovisioned = identity.roles.length === 0 && !identity.platformRole;

  return (
    <aside className="glass-strong sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-hidden rounded-none border-y-0 border-l-0 text-sidebar-foreground md:flex">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <StaffinixLogo />
      </div>

      <nav className="flex-1 space-y-7 overflow-y-auto px-3 py-5">
        {currentNavGroups.map((group) => (
          <NavGroup
            key={group.section}
            title={group.section}
            items={group.items}
            pathname={pathname}
          />
        ))}
        {(isPlatformApprover || isUnprovisioned) && (
          <NavGroup
            title="Access"
            items={[
              {
                to: "/access-request",
                label: isPlatformApprover ? "Platform Access Requests" : "Request Access",
                icon: Crown,
                feature: "dashboard",
              },
            ]}
            pathname={pathname}
          />
        )}
      </nav>

      <div className="space-y-2 border-t border-sidebar-border p-3">
        <Link
          to="/settings/profile"
          className={cn(
            "flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/80 transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            pathname.startsWith("/settings") && "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
        >
          <UserRound className="h-4 w-4" />
          Profile
        </Link>
        {tenancy?.tenant && (
          <div className="truncate rounded-xl border border-sidebar-border bg-sidebar-accent/20 px-3 py-2 text-xs text-sidebar-foreground/70">
            {tenancy.tenant.name}
            <span className="ml-1 capitalize text-sidebar-foreground/40">
              · {tenancy.tenant.plan}
            </span>
          </div>
        )}

        <div className="rounded-xl border border-sidebar-border/80 bg-sidebar-accent/30 p-2.5 shadow-inner">
          <div className="flex items-center justify-between text-[11px] font-semibold text-sidebar-foreground">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>Assigned Access</span>
            </div>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
              {level ?? "Pending"}
            </span>
          </div>
          <div className="mt-1.5 text-center text-[9px] text-sidebar-foreground/60 font-mono">
            {data?.roleTitle ?? "Awaiting role assignment"}
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavGroup({
  title,
  items,
  pathname,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/40">
        {title}
      </p>
      <div className="mt-1 space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "relative flex items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2 text-xs font-medium transition-all duration-200",
                active
                  ? "text-sidebar-accent-foreground font-semibold"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active-item"
                  className="absolute inset-0 rounded-xl border border-primary/15 bg-sidebar-accent shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_8%,transparent)]"
                  transition={{ type: "spring", stiffness: 430, damping: 34 }}
                />
              )}
              <Icon className={cn("relative h-4 w-4 shrink-0", active && "text-primary")} />
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
