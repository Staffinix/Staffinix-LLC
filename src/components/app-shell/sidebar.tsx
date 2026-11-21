import { Link, useRouterState } from "@tanstack/react-router";
import { Crown, UserRound } from "lucide-react";
import { StaffinixLogo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/use-profile";
import { useTenancy } from "@/hooks/use-tenancy";
import { canAccessFeature, type FeatureAccessIdentity } from "@/lib/feature-access";
import { NAV_GROUPS, type NavItem } from "@/components/app-shell/nav-config";
import { isNavGroupVisible } from "@/components/app-shell/nav-visibility";

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data } = useProfile();
  const { data: tenancy } = useTenancy();
  const level = data?.level ?? null;
  const identity: FeatureAccessIdentity = {
    roles: data?.roles ?? [],
    platformRole: data?.platformRole ?? null,
  };
  const currentNavGroups = NAV_GROUPS.filter((group) => isNavGroupVisible(group.section, level))
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessFeature(identity, item.feature)),
    }))
    .filter((group) => group.items.length > 0);
  const isPlatformApprover =
    data?.platformRole === "platform_owner" || data?.platformRole === "platform_admin";
  const isUnprovisioned = identity.roles.length === 0 && !identity.platformRole;

  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-5">
        <StaffinixLogo />
      </div>

      <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-y-contain px-3 py-4">
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

      <div className="shrink-0 space-y-2 border-t border-sidebar-border p-3">
        <Link
          to="/settings/profile"
          className={cn(
            "flex h-9 items-center gap-2 rounded-lg px-3 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            pathname.startsWith("/settings") && "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
        >
          <UserRound className="h-4 w-4 text-muted-foreground" />
          Profile
        </Link>
        <div className="px-3 pb-1 text-xs leading-5 text-muted-foreground">
          {tenancy?.tenant && (
            <p className="truncate">
              {tenancy.tenant.name} · <span className="capitalize">{tenancy.tenant.plan}</span>
            </p>
          )}
          <p className="truncate">{data?.roleTitle ?? "Awaiting role assignment"}</p>
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
      <p className="px-3 text-xs text-muted-foreground">{title}</p>
      <div className="mt-2 space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2 rounded-lg px-3 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
