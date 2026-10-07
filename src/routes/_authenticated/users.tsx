import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { UserPlus, MoreHorizontal, Loader2, ShieldAlert } from "lucide-react";
import { listUsers, inviteUser, updateUserRole, setUserActive } from "@/lib/users.functions";
import { useProfile } from "@/hooks/use-profile";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Team — Staffinix" }] }),
  component: UsersPage,
});

const ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "developer_admin", label: "Developer Admin" },
  { value: "recruiter", label: "Recruiter" },
  { value: "account_manager", label: "Account Manager" },
  { value: "delivery_manager", label: "Delivery Manager" },
  { value: "marketing_executive", label: "Marketing Executive" },
] as const;

function roleLabel(r: string) {
  return ROLES.find((x) => x.value === r)?.label ?? r;
}

function UsersPage() {
  const { data: me } = useProfile();
  const listFn = useServerFn(listUsers);
  const qc = useQueryClient();

  const isAdmin = me?.roles?.includes("super_admin") || me?.roles?.includes("admin");
  const isSuperAdmin = me?.roles?.includes("super_admin");

  const {
    data: users,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["users"],
    queryFn: () => listFn(),
    enabled: !!isAdmin,
  });

  if (!me) return null;

  if (!isAdmin) {
    return (
      <>
        <AppTopbar title="Team" />
        <main className="flex flex-1 items-center justify-center p-12">
          <div className="max-w-sm text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">Admin access required</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Team management is only available to Admins and Super Admins.
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppTopbar title="Company Team & Workload" />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <PageHeader
          title="Company Team & Recruiter Workload"
          description="Invite recruiters, assign roles, track active workload metrics (open reqs, submissions, interviews, placements), and manage departures."
          actions={
            <InviteDialog
              isSuperAdmin={!!isSuperAdmin}
              onInvited={() => qc.invalidateQueries({ queryKey: ["users"] })}
            />
          }
        />

        <div className="rounded-lg border border-border bg-card">
          {isLoading ? (
            <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading team…
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-destructive">{(error as Error).message}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Open reqs</TableHead>
                  <TableHead className="text-right">Submissions</TableHead>
                  <TableHead className="text-right">Interviews</TableHead>
                  <TableHead className="text-right">Placements</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((u) => (
                  <UserRow key={u.id} user={u} meId={me.userId} isSuperAdmin={!!isSuperAdmin} />
                ))}
                {users && users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                      No members yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </>
  );
}

type UserRow = Awaited<ReturnType<typeof listUsers>>[number] & {
  open_requirements?: number;
  submissions?: number;
  interviews?: number;
  placements?: number;
};

function UserRow({
  user,
  meId,
  isSuperAdmin,
}: {
  user: UserRow;
  meId: string;
  isSuperAdmin: boolean;
}) {
  const qc = useQueryClient();
  const updateRoleFn = useServerFn(updateUserRole);
  const setActiveFn = useServerFn(setUserActive);

  const roleMutation = useMutation({
    mutationFn: (role: string) =>
      updateRoleFn({ data: { user_id: user.id, role: role as (typeof ROLES)[number]["value"] } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Role updated");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const activeMutation = useMutation({
    mutationFn: (is_active: boolean) => setActiveFn({ data: { user_id: user.id, is_active } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Updated");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const initials =
    user.full_name
      ?.split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? user.email[0].toUpperCase();

  const currentRole = user.roles[0];
  const isSelf = user.id === meId;

  const openReqs = user.open_requirements ?? 0;
  const submissions = user.submissions ?? 0;
  const interviews = user.interviews ?? 0;
  const placements = user.placements ?? 0;

  return (
    <TableRow>
      <TableCell>
        <Link
          to="/recruiters/$id"
          params={{ id: user.id }}
          className="flex items-center gap-3 hover:underline"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary/20 text-xs text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium text-foreground">
              {user.full_name ?? "—"}{" "}
              {isSelf && (
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">(you)</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </Link>
      </TableCell>
      <TableCell>
        {isSuperAdmin && !isSelf ? (
          <Select
            value={currentRole ?? undefined}
            onValueChange={(v) => roleMutation.mutate(v)}
            disabled={roleMutation.isPending}
          >
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="secondary" className="font-normal">
            {currentRole ? roleLabel(currentRole) : "No role"}
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right font-mono text-sm">{openReqs}</TableCell>
      <TableCell className="text-right font-mono text-sm">{submissions}</TableCell>
      <TableCell className="text-right font-mono text-sm">{interviews}</TableCell>
      <TableCell className="text-right font-mono text-sm">{placements}</TableCell>
      <TableCell>
        {user.is_active ? (
          <Badge className="bg-success/15 font-normal text-success hover:bg-success/15">
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            Deactivated
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {user.last_sign_in_at
          ? formatDistanceToNow(new Date(user.last_sign_in_at), { addSuffix: true })
          : "Never"}
      </TableCell>
      <TableCell>
        {!isSelf && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {user.is_active ? (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => activeMutation.mutate(false)}
                >
                  Deactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => activeMutation.mutate(true)}>
                  Reactivate
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}

function InviteDialog({
  isSuperAdmin,
  onInvited,
}: {
  isSuperAdmin: boolean;
  onInvited: () => void;
}) {
  const inviteFn = useServerFn(inviteUser);
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]["value"]>("recruiter");

  const mutation = useMutation({
    mutationFn: () => inviteFn({ data: { full_name: fullName, email, role } }),
    onSuccess: () => {
      toast.success(`Invite sent to ${email}`);
      setOpen(false);
      setFullName("");
      setEmail("");
      setRole("recruiter");
      onInvited();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const assignable = ROLES.filter(
    (r) =>
      isSuperAdmin ||
      (r.value !== "super_admin" && r.value !== "admin" && r.value !== "developer_admin"),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Invite member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite team member</DialogTitle>
          <DialogDescription>
            They'll get an email invite to set their password and join Staffinix.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">Full name</Label>
            <Input
              id="invite-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Work email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignable.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
