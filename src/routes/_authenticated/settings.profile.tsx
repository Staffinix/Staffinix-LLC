import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  Loader2,
  Mail,
  Phone as PhoneIcon,
  ShieldCheck,
  User,
} from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/hooks/use-session";
import { useRoleLevel } from "@/hooks/use-role-level";
import { supabase } from "@/integrations/supabase/client";
import { updateMyProfile } from "@/lib/profile.functions";
import { createProfileAvatarReference, PROFILE_AVATAR_BUCKET } from "@/lib/profile-avatar";

const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const PROFILE_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const ROLE_MAP: Record<string, { label: string; desc: string }> = {
  super_admin: { label: "Super Admin", desc: "Full administrative and tenant access" },
  admin: { label: "Admin", desc: "Company administration and team management" },
  developer_admin: { label: "Developer Admin", desc: "API, webhook, and developer console access" },
  delivery_manager: { label: "Delivery Manager", desc: "Account and placement oversight" },
  account_manager: {
    label: "Account Manager",
    desc: "Client relationship and requirement manager",
  },
  recruiter: { label: "Recruiter", desc: "Candidate sourcing, matching, and submissions" },
  marketing_executive: { label: "Marketing Executive", desc: "Outreach and pipeline operations" },
  platform_owner: { label: "Platform Owner", desc: "Staffinix SaaS system owner" },
  platform_admin: { label: "Platform Admin", desc: "SaaS system administrator" },
  platform_support: { label: "Platform Support", desc: "SaaS support engineer" },
};

export const Route = createFileRoute("/_authenticated/settings/profile")({
  head: () => ({ meta: [{ title: "Profile — Staffinix" }] }),
  component: ProfileSettingsPage,
});

function ProfileSettingsPage() {
  const { data, isLoading } = useProfile();
  const { user } = useSession();
  const { level } = useRoleLevel();
  const qc = useQueryClient();
  const updateFn = useServerFn(updateMyProfile);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUrlDirty, setAvatarUrlDirty] = useState(false);

  const emailFromSession = user?.email || "";
  const nameFromSession =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    (emailFromSession
      ? emailFromSession
          .split("@")[0]
          .replace(/[._-]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : "");
  const avatarFromSession =
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined) ||
    "";
  const phoneFromSession = user?.phone || (user?.user_metadata?.phone as string | undefined) || "";
  useEffect(() => {
    const initialName = data?.profile?.full_name || nameFromSession;
    const initialPhone = data?.profile?.phone || phoneFromSession;
    const initialAvatar = data?.profile?.avatar_url || avatarFromSession;

    if (initialName) setFullName((prev) => prev || initialName);
    if (initialPhone) setPhone((prev) => prev || initialPhone);
    if (initialAvatar) setAvatarUrl((prev) => prev || initialAvatar);
  }, [data?.profile, nameFromSession, phoneFromSession, avatarFromSession]);

  const mutation = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          full_name: fullName.trim() || undefined,
          phone: phone.trim() || null,
          ...(avatarUrlDirty ? { avatar_url: avatarUrl.trim() || null } : {}),
        },
      }),
    onSuccess: () => {
      setAvatarUrlDirty(false);
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile updated successfully");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user?.id) throw new Error("Your authenticated profile is not ready yet.");
      if (!PROFILE_AVATAR_TYPES.has(file.type)) {
        throw new Error("Choose a JPEG, PNG, or WebP image.");
      }
      if (file.size < 1 || file.size > PROFILE_AVATAR_MAX_BYTES) {
        throw new Error("Profile pictures must be smaller than 5 MB.");
      }

      const path = `${user.id}/avatar`;
      const { error: uploadError } = await supabase.storage
        .from(PROFILE_AVATAR_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: true,
        });
      if (uploadError) throw new Error(`Unable to upload profile picture: ${uploadError.message}`);

      const { data: signed, error: signError } = await supabase.storage
        .from(PROFILE_AVATAR_BUCKET)
        .createSignedUrl(path, 10 * 60);
      if (signError || !signed?.signedUrl) {
        throw new Error("The photo was uploaded, but a private preview could not be created.");
      }

      await updateFn({ data: { avatar_url: createProfileAvatarReference(user.id) } });
      return signed.signedUrl;
    },
    onSuccess: async (nextAvatarUrl) => {
      setAvatarUrl(nextAvatarUrl);
      setAvatarUrlDirty(false);
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile picture updated");
    },
    onError: (error) => toast.error((error as Error).message),
    onSettled: () => {
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    },
  });

  const resolvedEmail = data?.email || data?.profile?.email || emailFromSession;
  const displayName = fullName || data?.profile?.full_name || nameFromSession || "User";

  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ||
    resolvedEmail?.[0]?.toUpperCase() ||
    "U";

  const effectiveRoles = data?.roles ?? [];

  return (
    <>
      <AppTopbar title="Profile" />
      <main className="flex-1 space-y-6 p-6 md:p-8 flex flex-col items-center">
        <div className="w-full max-w-2xl">
          <PageHeader
            title="Profile"
            description="Manage your account profile, personal contact details, and organization credentials."
          />
        </div>

        <Card className="w-full max-w-2xl border-border bg-card shadow-sm">
          <CardContent className="p-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
              className="space-y-6"
            >
              {/* Header preview & Avatar */}
              <div className="flex items-center gap-4 border-b border-border/70 pb-5">
                <Avatar className="h-16 w-16 border-2 border-primary/20 shrink-0 shadow-xs">
                  <AvatarImage src={avatarUrl || undefined} alt={displayName} />
                  <AvatarFallback className="bg-primary/20 text-lg font-bold text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground truncate">
                      {displayName}
                    </h3>
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-primary/10 text-primary border-primary/20"
                    >
                      {level ? `${level} Active` : "Access pending"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5 truncate">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{resolvedEmail || "Signed in"}</span>
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      ref={avatarInputRef}
                      id="profile-picture-upload"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) avatarMutation.mutate(file);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!user?.id || avatarMutation.isPending}
                      onClick={() => avatarInputRef.current?.click()}
                      className="h-8 text-xs"
                    >
                      {avatarMutation.isPending ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Camera className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {avatarMutation.isPending ? "Uploading…" : "Update photo"}
                    </Button>
                    <span className="text-[10px] text-muted-foreground">
                      JPEG, PNG or WebP · max 5 MB
                    </span>
                  </div>
                </div>
              </div>

              {/* Avatar URL */}
              <div className="space-y-1.5">
                <Label htmlFor="avatar" className="text-xs font-medium">
                  Profile image URL (optional)
                </Label>
                <Input
                  id="avatar"
                  placeholder="https://images.unsplash.com/..."
                  value={avatarUrl}
                  onChange={(e) => {
                    setAvatarUrl(e.target.value);
                    setAvatarUrlDirty(true);
                  }}
                  className="bg-surface text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  You can upload a photo above, paste a direct image link, or leave this empty to
                  use your initials.
                </p>
              </div>

              {/* Name & Phone */}
              <div className="space-y-1.5">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-medium flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    Full name
                  </Label>
                  <Input
                    id="name"
                    required
                    placeholder="Your Name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="bg-surface text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-medium flex items-center gap-1">
                    <PhoneIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    Phone Number
                  </Label>
                  <Input
                    id="phone"
                    placeholder="+1 (555) 000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="bg-surface text-xs"
                  />
                </div>
              </div>

              {/* Emails */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      Company Email ID
                    </Label>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                      <CheckCircle2 className="h-3 w-3" /> Verified
                    </span>
                  </div>
                  <Input
                    value={resolvedEmail}
                    disabled
                    className="bg-muted/60 cursor-not-allowed text-xs font-medium text-foreground"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Connected to your authenticated login identity.
                  </p>
                </div>
              </div>

              {/* Roles & Level */}
              <div className="space-y-2 border-t border-border/70 pt-4">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Assigned Authorization Roles
                  </Label>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    Security Level:{" "}
                    <span className="font-bold text-primary">{level ?? "Pending"}</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {effectiveRoles.map((r) => {
                    const info = ROLE_MAP[r] ?? {
                      label: r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                      desc: "Authorized organization role",
                    };
                    return (
                      <div
                        key={r}
                        className="flex flex-col rounded-lg border border-border bg-surface/70 px-3 py-2 text-xs shadow-2xs"
                      >
                        <span className="font-semibold text-foreground">{info.label}</span>
                        <span className="text-[10px] text-muted-foreground">{info.desc}</span>
                      </div>
                    );
                  })}
                  {effectiveRoles.length === 0 && !data?.platformRole && (
                    <p className="text-xs text-muted-foreground">
                      No application role is assigned. Submit an access request or contact an
                      administrator.
                    </p>
                  )}
                  {data?.platformRole && (
                    <div className="flex flex-col rounded-lg border border-border bg-surface/70 px-3 py-2 text-xs shadow-2xs">
                      <span className="font-semibold text-foreground">
                        {ROLE_MAP[data.platformRole]?.label ?? data.platformRole}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {ROLE_MAP[data.platformRole]?.desc ?? "Authorized platform membership"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={mutation.isPending}
                  className="bg-primary text-primary-foreground font-semibold px-6 shadow-sm hover:bg-primary/90"
                >
                  {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
