import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { useEffect, useState } from "react";
import { LogOut, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { beginSignOut, cancelSignOut, useSession } from "@/hooks/use-session";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { CopilotDrawer } from "@/components/ai/copilot-drawer";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  recruiter: "Recruiter",
  account_manager: "Account Manager",
  delivery_manager: "Delivery Manager",
  marketing_executive: "Marketing",
  developer_admin: "Developer Admin",
  platform_owner: "Platform Owner",
  platform_admin: "Platform Admin",
  platform_support: "Platform Support",
};

export function AppTopbar({ title }: { title: string }) {
  const { data } = useProfile();
  const { user } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const userEmail = data?.email || data?.profile?.email || user?.email || "";
  const rawName =
    data?.profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    (user?.user_metadata?.user_name as string | undefined) ||
    (user?.user_metadata?.username as string | undefined) ||
    (userEmail
      ? userEmail
          .split("@")[0]
          .replace(/[._-]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : "") ||
    "User";

  const cleanName = rawName.replace(/\s*\(.*?\)/g, "").trim() || "User";

  const avatarSrc =
    data?.profile?.avatar_url ||
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined) ||
    undefined;

  const initials =
    cleanName
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ||
    userEmail?.[0]?.toUpperCase() ||
    "U";

  async function handleSignOut() {
    flushSync(() => beginSignOut());
    try {
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    } catch (error) {
      cancelSignOut();
      navigate({ to: "/auth", replace: true });
    }
  }

  const primaryRole = data?.platformRole ?? data?.roles?.[0] ?? null;

  return (
    <header className="pointer-events-none sticky top-0 z-30 flex h-20 items-center px-3 md:px-5">
      <div
        className={cn(
          "glass pointer-events-auto flex h-13 w-full items-center justify-between rounded-2xl px-3.5 transition-all duration-300 md:px-4",
          scrolled && "glass-strong -translate-y-0.5 shadow-lg",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="size-2 shrink-0 rounded-full bg-primary shadow-[0_0_12px_var(--primary-glow)]" />
          <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">{title}</h1>
        </div>

        <div className="flex items-center gap-1 md:gap-2">
          {primaryRole && (
            <Badge variant="outline" className="hidden text-[10px] md:inline-flex">
              {ROLE_LABEL[primaryRole] ?? primaryRole.replace(/_/g, " ")}
            </Badge>
          )}

          <CopilotDrawer />

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="glass" className="h-9 gap-2 px-1.5 md:px-2.5">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={avatarSrc} />
                  <AvatarFallback className="bg-primary/20 text-xs font-bold text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-xs font-semibold text-foreground md:inline-block">
                  {cleanName}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col gap-0.5 text-xs">
                <span className="font-semibold text-foreground">{cleanName}</span>
                <span className="text-[11px] text-muted-foreground font-normal truncate">
                  {userEmail || "Signed in"}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/settings/profile" })}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
