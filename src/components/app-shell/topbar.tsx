import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { flushSync } from "react-dom";
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
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { CopilotDrawer } from "@/components/ai/copilot-drawer";
import { getAssignedRoleLabel } from "@/lib/role-presentation";

export function AppTopbar({ title }: { title: string }) {
  const { data } = useProfile();
  const { user } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();

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

  const hasAssignedRole = !!data?.level;

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center border-b border-border bg-background px-4 sm:px-6 md:px-8">
      <div className="flex w-full items-center justify-between">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">{title}</p>

        <div className="flex items-center gap-1 md:gap-2">
          {hasAssignedRole && (
            <span className="hidden text-xs text-muted-foreground md:inline">
              {getAssignedRoleLabel(data?.roles ?? [], data?.platformRole ?? null)}
            </span>
          )}

          <CopilotDrawer />

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 gap-2 px-1.5 md:px-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={avatarSrc} />
                  <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-normal text-foreground md:inline-block">
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
