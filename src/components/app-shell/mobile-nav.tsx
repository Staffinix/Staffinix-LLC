import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, UserRound } from "lucide-react";

import { NAV_GROUPS, type NavItem } from "@/components/app-shell/nav-config";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/use-profile";
import { canAccessFeature, type FeatureAccessIdentity } from "@/lib/feature-access";

const PRIMARY_PATHS = ["/dashboard", "/requirements", "/candidates", "/submissions/board"];

export function MobileNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data } = useProfile();
  const identity: FeatureAccessIdentity = {
    roles: data?.roles ?? [],
    platformRole: data?.platformRole ?? null,
  };
  const permitted = NAV_GROUPS.flatMap((group) => group.items).filter((item) =>
    canAccessFeature(identity, item.feature),
  );
  const primary = PRIMARY_PATHS.map((path) => permitted.find((item) => item.to === path)).filter(
    (item): item is NavItem => Boolean(item),
  );
  const secondary = permitted.filter((item) => !PRIMARY_PATHS.includes(item.to));

  return (
    <nav
      className="safe-bottom glass-strong fixed inset-x-3 bottom-3 z-40 flex min-h-16 rounded-[1.35rem] px-1.5 pt-1.5 md:hidden"
      aria-label="Mobile navigation"
    >
      {primary.slice(0, 4).map((item) => (
        <MobileNavLink key={item.to} item={item} pathname={pathname} />
      ))}
      <Dialog>
        <DialogTrigger asChild>
          <button className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
            <Menu className="size-5" aria-hidden="true" />
            <span>More</span>
          </button>
        </DialogTrigger>
        <DialogContent className="bottom-2 top-auto w-[calc(100%-1rem)] max-w-none translate-y-0 rounded-[1.5rem] p-4 sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:max-w-lg sm:-translate-y-1/2">
          <DialogHeader className="px-1 text-left">
            <DialogTitle>All workspace tools</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[65vh] grid-cols-2 gap-2 overflow-y-auto pt-2">
            {secondary.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-card/70 p-3 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-accent"
                >
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  {item.label}
                </Link>
              );
            })}
            <Link
              to="/settings/profile"
              className="flex items-center gap-2.5 rounded-xl border border-border bg-card/70 p-3 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-accent"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <UserRound className="size-4" aria-hidden="true" />
              </span>
              Profile
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </nav>
  );
}

function MobileNavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
  return (
    <Link
      to={item.to}
      className={cn(
        "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[10px] font-medium transition-colors",
        active
          ? "bg-primary/12 text-primary"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="size-5" aria-hidden="true" />
      <span className="max-w-full truncate">
        {item.label.replace("Pipeline Tracker", "Pipeline")}
      </span>
    </Link>
  );
}
