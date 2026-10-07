import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { canAccessPath, getDefaultAuthorizedPath } from "@/lib/feature-access";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
  UserRound,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/profile.functions";

import { StaffinixLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { cn } from "@/lib/utils";
import { isAllowedWorkEmail } from "@/lib/work-email-policy";

/**
 * ---------------------------------------------------------------------------
 * Route configuration
 * ---------------------------------------------------------------------------
 */

const AuthSearch = z.object({
  /**
   * Optional internal redirect after authentication.
   *
   * We validate this again before using it so that an attacker cannot
   * provide an arbitrary external URL.
   */
  redirect: z.string().optional(),
  mode: z.enum(["recovery"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: AuthSearch,

  head: () => ({
    meta: [
      {
        title: "Sign in — Staffinix",
      },
      {
        name: "robots",
        content: "noindex,nofollow",
      },
    ],
  }),

  component: AuthPage,
});

/**
 * ---------------------------------------------------------------------------
 * Constants
 * ---------------------------------------------------------------------------
 */

const MIN_PASSWORD_LENGTH = 8;

const AUTH_ERROR_MESSAGES = {
  INVALID_CREDENTIALS: "Invalid email or password.",
  EMAIL_NOT_CONFIRMED: "Please verify your email address before signing in.",
  TOO_MANY_REQUESTS: "Too many authentication attempts. Please wait and try again.",
  GENERIC: "Unable to complete authentication. Please try again.",
  WORK_EMAIL_REQUIRED: "Use your authorized work email to access Staffinix.",
};

/**
 * ---------------------------------------------------------------------------
 * Utility functions
 * ---------------------------------------------------------------------------
 */

/**
 * Only allow internal application paths.
 *
 * Valid:
 *   /overview
 *   /dashboard
 *   /jobs/123
 *
 * Invalid:
 *   https://evil.example.com
 *   //evil.example.com
 *   javascript:...
 */
function getSafeRedirect(value?: string): string {
  if (!value) {
    return "/overview";
  }

  const redirect = value.trim();

  if (!redirect.startsWith("/") || redirect.startsWith("//") || redirect.includes("\\")) {
    return "/overview";
  }

  return redirect;
}

function getPostAuthRedirect(
  profile: { roles: string[]; platformRole: string | null },
  requestedPath: string,
): string {
  const identity = { roles: profile.roles, platformRole: profile.platformRole };
  const defaultPath = getDefaultAuthorizedPath(identity);
  if (requestedPath === "/overview") return defaultPath;
  return canAccessPath(identity, requestedPath) ? requestedPath : defaultPath;
}

/**
 * Convert Supabase authentication errors into safe user-facing messages.
 *
 * We intentionally avoid exposing unnecessary backend details.
 */
function getAuthErrorMessage(message?: string): string {
  const normalized = (message ?? "").toLowerCase();

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid credentials") ||
    normalized.includes("invalid email") ||
    normalized.includes("invalid password")
  ) {
    return AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS;
  }

  if (normalized.includes("email not confirmed")) {
    return AUTH_ERROR_MESSAGES.EMAIL_NOT_CONFIRMED;
  }

  if (normalized.includes("too many requests") || normalized.includes("rate limit")) {
    return AUTH_ERROR_MESSAGES.TOO_MANY_REQUESTS;
  }

  return AUTH_ERROR_MESSAGES.GENERIC;
}

/**
 * ---------------------------------------------------------------------------
 * Main authentication page
 * ---------------------------------------------------------------------------
 */

function AuthPage() {
  const search = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const getMyProfileFn = useServerFn(getMyProfile);

  const safeRedirect = useMemo(() => getSafeRedirect(search.redirect), [search.redirect]);

  /**
   * If Supabase confirms the user, don't show the login
   * screen again.
   */
  useEffect(() => {
    let mounted = true;

    const checkExistingSession = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error?.name === "AuthSessionMissingError") {
          return;
        }

        if (error) {
          console.error("Failed to retrieve authentication session:", error);
          return;
        }

        if (mounted && user && search.mode !== "recovery") {
          try {
            const profile = await getMyProfileFn();
            navigate({
              to: getPostAuthRedirect(profile, safeRedirect),
              replace: true,
            });
          } catch {
            await supabase.auth.signOut();
            toast.error("Your account is not provisioned for this application.");
          }
        }
      } catch (error) {
        console.error("Session initialization failed:", error);
      }
    };

    void checkExistingSession();

    return () => {
      mounted = false;
    };
  }, [getMyProfileFn, navigate, safeRedirect, search.mode]);

  return (
    <div className="relative min-h-screen bg-background">
      {/* Theme switcher */}
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <div className="mx-auto grid min-h-screen max-w-6xl items-stretch lg:grid-cols-2">
        {/* -----------------------------------------------------------------
            Brand panel
            ----------------------------------------------------------------- */}
        <aside className="relative hidden overflow-hidden border-r border-border bg-surface p-10 lg:flex lg:flex-col">
          <div className="bg-grid absolute inset-0 opacity-50" />

          <div className="absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-primary/20 blur-[110px]" />

          <div className="relative z-10 flex h-full flex-col">
            <Link to="/" aria-label="Staffinix home" className="w-fit">
              <StaffinixLogo size={32} />
            </Link>

            <div className="mt-auto">
              <h2 className="text-3xl font-semibold leading-tight tracking-tight">
                Welcome back to
                <br />
                <span className="text-brand-gradient">AI recruitment</span>
              </h2>

              <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Automate candidate sourcing, match bench talent in seconds, and generate 100%
                truthful tailored submissions.
              </p>

              <ul className="mt-8 space-y-3 text-sm">
                {[
                  {
                    icon: Zap,
                    text: "Instant 13-field JD parsing",
                  },
                  {
                    icon: ShieldCheck,
                    text: "3-layer anti-fabrication guarantee",
                  },
                  {
                    icon: Lock,
                    text: "Outlook & Gmail native drafts",
                  },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-2.5 text-muted-foreground">
                    <Icon className="h-4 w-4 text-primary" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>

            <p className="relative z-10 mt-10 border-t border-border pt-5 text-[11px] text-muted-foreground">
              © {new Date().getFullYear()} Staffinix AI Platform · Enterprise Edition
            </p>
          </div>
        </aside>

        {/* -----------------------------------------------------------------
            Authentication panel
            ----------------------------------------------------------------- */}
        <main className="flex items-center justify-center px-4 py-14">
          <div className="w-full max-w-sm">
            <div className="mb-7 flex flex-col items-center text-center">
              <Link to="/" className="lg:hidden" aria-label="Staffinix home">
                <StaffinixLogo size={32} />
              </Link>

              <div className="mt-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="h-5 w-5" />
              </div>

              <h1 className="mt-4 text-xl font-semibold tracking-tight">Welcome to Staffinix</h1>

              <p className="mt-1 text-xs text-muted-foreground">
                Sign in to your Staffinix recruitment workspace
              </p>
            </div>

            {search.mode === "recovery" ? (
              <PasswordRecoveryForm />
            ) : (
              <Tabs defaultValue="signin">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>

                  <TabsTrigger value="signup">Create account</TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="mt-5">
                  <SignInForm redirect={safeRedirect} />
                </TabsContent>

                <TabsContent value="signup" className="mt-5">
                  <SignUpForm redirect={safeRedirect} />
                </TabsContent>
              </Tabs>
            )}

            <p className="mt-6 text-center text-[11px] text-muted-foreground">
              By continuing you agree to Staffinix&apos;s terms of service.
            </p>

            <p className="mt-3 text-center text-[11px]">
              <Link to="/" className="text-muted-foreground hover:text-foreground">
                ← Back to home
              </Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * ---------------------------------------------------------------------------
 * Google OAuth
 * ---------------------------------------------------------------------------
 */

function GoogleButton({ redirect }: { redirect: string }) {
  const [loading, setLoading] = useState(false);

  async function handleGoogleSignIn() {
    if (loading) {
      return;
    }

    setLoading(true);

    try {
      const callbackUrl = new URL("/auth", window.location.origin);
      callbackUrl.searchParams.set("redirect", redirect);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });

      if (error) {
        console.error("Google OAuth failed:", error);

        toast.error(getAuthErrorMessage(error.message));

        setLoading(false);
      }
    } catch (error) {
      console.error("Google sign-in failed:", error);

      toast.error(AUTH_ERROR_MESSAGES.GENERIC);

      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleGoogleSignIn}
      disabled={loading}
      className="w-full"
    >
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}

      {loading ? "Connecting..." : "Continue with Google"}
    </Button>
  );
}

/**
 * Google logo.
 */
function GoogleIcon() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 5c1.6 0 3 .55 4.1 1.6l3-3C17.2 1.9 14.8 1 12 1 7.4 1 3.4 3.6 1.4 7.4l3.5 2.7C5.9 7.1 8.7 5 12 5z"
      />

      <path
        fill="#4285F4"
        d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2c-.3 1.4-1.1 2.6-2.4 3.4l3.5 2.7c2-1.9 3.7-4.7 3.7-8.3z"
      />

      <path
        fill="#FBBC05"
        d="M4.9 14.3a7 7 0 010-4.6L1.4 7C.5 8.5 0 10.2 0 12s.5 3.5 1.4 5l3.5-2.7z"
      />

      <path
        fill="#34A853"
        d="M12 23c3 0 5.6-1 7.4-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.9 1.1-3.3 0-6.1-2.1-7.1-5L1.4 16.6C3.4 20.4 7.4 23 12 23z"
      />
    </svg>
  );
}

/**
 * ---------------------------------------------------------------------------
 * Sign-in form
 * ---------------------------------------------------------------------------
 */

function SignInForm({ redirect }: { redirect: string }) {
  const navigate = useNavigate();
  const getMyProfileFn = useServerFn(getMyProfile);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function handlePasswordReset() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error("Enter your email address first.");
      return;
    }

    setResetLoading(true);
    try {
      const callbackUrl = new URL("/auth", window.location.origin);
      callbackUrl.searchParams.set("mode", "recovery");
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: callbackUrl.toString(),
      });
      if (error) throw error;
      toast.success("If that account exists, a password reset link has been sent.");
    } catch {
      toast.error(AUTH_ERROR_MESSAGES.GENERIC);
    } finally {
      setResetLoading(false);
    }
  }

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      toast.error("Please enter your email address.");
      return;
    }

    if (!password) {
      toast.error("Please enter your password.");
      return;
    }

    setLoading(true);
    let postAuthRedirect = redirect;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error || !data.user) {
        throw new Error(getAuthErrorMessage(error?.message));
      }

      let fullName =
        data.user.user_metadata?.full_name ||
        data.user.user_metadata?.name ||
        data.user.email?.split("@")[0] ||
        "User";

      try {
        const profile = await getMyProfileFn();
        if (profile?.profile?.full_name) {
          fullName = profile.profile.full_name;
        }

        postAuthRedirect = getPostAuthRedirect(profile, redirect);
      } catch {
        await supabase.auth.signOut();
        throw new Error("Your account is not provisioned for this application.");
      }

      /**
       * Authentication succeeded.
       */
      toast.success(`Welcome back, ${fullName}.`);

      navigate({
        to: postAuthRedirect,
        replace: true,
      });
    } catch (error) {
      console.error("Sign-in failed:", error);

      const message = error instanceof Error ? error.message : AUTH_ERROR_MESSAGES.GENERIC;

      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <GoogleButton redirect={redirect} />

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>

        <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
          <span className="bg-card px-2 text-muted-foreground">or email sign in</span>
        </div>
      </div>

      <form onSubmit={handleSignIn} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="signin-email" className="text-xs">
            Email
          </Label>

          <Input
            id="signin-email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={loading}
            placeholder="you@company.com"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="signin-pw" className="text-xs">
              Password
            </Label>

            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={loading || resetLoading}
              className="text-[11px] text-primary hover:underline"
            >
              {resetLoading ? "Sending…" : "Forgot password?"}
            </button>
          </div>

          <div className="relative">
            <Input
              id="signin-pw"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              disabled={loading}
              className="pr-10"
              placeholder="Enter your password"
            />

            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((value) => !value)}
              disabled={loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}

          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <SecurityNotice />
    </div>
  );
}

function PasswordRecoveryForm() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRecovery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Recovery session is invalid or expired.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success("Password updated. Sign in with your new password.");
      navigate({ to: "/auth", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : AUTH_ERROR_MESSAGES.GENERIC);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleRecovery} className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        Choose a new password for your authenticated account.
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="recovery-password">New password</Label>
        <Input
          id="recovery-password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={loading}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="recovery-confirm-password">Confirm new password</Label>
        <Input
          id="recovery-confirm-password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={loading}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Update password
      </Button>
    </form>
  );
}

/**
 * ---------------------------------------------------------------------------
 * Sign-up form
 * ---------------------------------------------------------------------------
 */

function SignUpForm({ redirect }: { redirect: string }) {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedName) {
      toast.error("Please enter your full name.");
      return;
    }

    if (!normalizedEmail) {
      toast.error("Please enter your work email.");
      return;
    }

    if (!isAllowedWorkEmail(normalizedEmail)) {
      toast.error(AUTH_ERROR_MESSAGES.WORK_EMAIL_REQUIRED);
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          /**
           * Only store non-privileged profile metadata here.
           *
           * NEVER send:
           * - role
           * - role_level
           * - is_platform_staff
           * - tenant ownership
           * - admin permissions
           *
           * Those values must be controlled server-side.
           */
          data: {
            full_name: normalizedName,
          },

          /**
           * Supabase will redirect the user back to the
           * application after email verification.
           */
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });

      if (error) {
        console.error("Sign-up failed:", error);

        toast.error(getAuthErrorMessage(error.message));

        return;
      }

      /**
       * If email confirmation is enabled, Supabase returns no active
       * session until the user verifies their email.
       */
      if (!data.session) {
        toast.success("Account created. Please check your email to verify your account.");

        return;
      }

      /**
       * If email confirmation is disabled and Supabase immediately
       * creates a session, the user can continue.
       */
      toast.success("Account created successfully.");

      navigate({
        to: "/access-request",
        replace: true,
      });
    } catch (error) {
      console.error("Unexpected sign-up error:", error);

      toast.error(AUTH_ERROR_MESSAGES.GENERIC);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <GoogleButton redirect={redirect} />

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>

        <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
          <span className="bg-card px-2 text-muted-foreground">or email</span>
        </div>
      </div>

      <form onSubmit={handleSignUp} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="signup-name" className="text-xs">
            Full name
          </Label>

          <Input
            id="signup-name"
            name="name"
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
            disabled={loading}
            placeholder="Your full name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signup-email" className="text-xs">
            Work email
          </Label>

          <Input
            id="signup-email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={loading}
            placeholder="you@company.com"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signup-pw" className="text-xs">
            Password
          </Label>

          <div className="relative">
            <Input
              id="signup-pw"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              disabled={loading}
              className="pr-10"
              placeholder="At least 8 characters"
            />

            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((value) => !value)}
              disabled={loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signup-confirm-pw" className="text-xs">
            Confirm password
          </Label>

          <Input
            id="signup-confirm-pw"
            name="confirm-password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            disabled={loading}
            placeholder="Re-enter your password"
          />
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}

          {loading ? "Creating account..." : "Create account"}
        </Button>
      </form>

      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />

          <div>
            <p className="text-xs font-medium">Secure account provisioning</p>

            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              New accounts receive only the permissions assigned by your organization.
              Administrative roles are never granted through the signup form.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ---------------------------------------------------------------------------
 * Security notice
 * ---------------------------------------------------------------------------
 */

function SecurityNotice() {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex gap-2">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />

        <div>
          <p className="text-xs font-medium">Secure authentication</p>

          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Your credentials are verified by Supabase Auth. Staffinix never determines your role
            from information entered in this form.
          </p>
        </div>
      </div>
    </div>
  );
}
