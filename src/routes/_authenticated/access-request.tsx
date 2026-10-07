import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Crown, ShieldCheck, CheckCircle2, XCircle, Mail, Sparkles } from "lucide-react";
import { AppTopbar } from "@/components/app-shell/topbar";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getMyAccessRequest,
  listAccessRequests,
  reviewAccessRequest,
  requestPlatformAccess,
} from "@/lib/access-requests.functions";
import {
  ACCESS_REQUEST_REASON_MAX_LENGTH,
  ACCESS_REQUEST_REASON_MIN_LENGTH,
  ACCESS_TIER_OPTIONS,
  getAccessTierLabel,
  isRequestableAccessTier,
  type RequestableAccessTier,
} from "@/lib/access-request-tiers";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/access-request")({
  head: () => ({
    meta: [{ title: "Recruiter Approvals — Staffinix" }],
  }),
  component: AccessRequestPage,
});

function AccessRequestPage() {
  const { data: me } = useProfile();
  const isApprover = me?.platformRole === "platform_owner" || me?.platformRole === "platform_admin";

  return (
    <>
      <AppTopbar title={isApprover ? "Recruiter Approvals" : "Request Platform Access"} />
      <main className="flex-1 space-y-6 p-6 md:p-8">
        <PageHeader
          title={isApprover ? "Recruiter Authorization & Approvals" : "Request Platform Access"}
          description={
            isApprover
              ? "Review pending access requests from recruiters. Approve or reject authorization to manage desk tools & API permissions."
              : "Submit an access request to your technical lead (L3) or company admin for elevated platform permissions."
          }
        />

        {isApprover ? <ApproverTable /> : <RecruiterRequestForm />}
      </main>
    </>
  );
}

function ApproverTable() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAccessRequests);
  const reviewFn = useServerFn(reviewAccessRequest);
  const { isAuthenticated } = useSession();

  const {
    data: requestsData = [],
    isPending,
    isError,
  } = useQuery({
    queryKey: ["access-requests-list"],
    queryFn: () => listFn(),
    enabled: isAuthenticated,
    retry: 2,
  });

  const [overrideMap, setOverrideMap] = useState<Record<string, string>>({});

  const requests = requestsData.map((r) => ({
    ...r,
    status: overrideMap[r.id] ?? r.status,
  }));

  function handleAction(id: string, approve: boolean, recruiterName: string) {
    const newStatus = approve ? "approved" : "denied";
    reviewFn({ data: { id, approve } })
      .then(() => {
        setOverrideMap((prev) => ({ ...prev, [id]: newStatus }));
        toast.success(`${approve ? "Approved" : "Rejected"} access for ${recruiterName}`);
        qc.invalidateQueries({ queryKey: ["access-requests-list"] });
      })
      .catch((e) => toast.error(e.message));
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-warning/30 bg-warning/10 text-warning px-2.5 py-1"
          >
            {pendingCount} Pending Approvals
          </Badge>
          <span className="text-xs text-muted-foreground">L3 Dev Lead Authorization Desk</span>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold">Recruiter Access Requests</CardTitle>
          <CardDescription className="text-xs">
            Review and grant platform authorization to onboarding recruiters.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-xs font-semibold">Recruiter Name & Email</TableHead>
                <TableHead className="text-xs font-semibold">Requested Tier</TableHead>
                <TableHead className="text-xs font-semibold">Justification / Reason</TableHead>
                <TableHead className="text-xs font-semibold">Requested Date</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-right text-xs font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                    Loading access requests…
                  </TableCell>
                </TableRow>
              )}
              {isError && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-xs text-destructive">
                    Access requests could not be loaded.
                  </TableCell>
                </TableRow>
              )}
              {!isPending && !isError && requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                    No access requests found.
                  </TableCell>
                </TableRow>
              )}
              {requests.map((r) => {
                const name = r.user_email?.split("@")[0] || "Account holder";
                const email = r.user_email || "Email unavailable";
                const isPending = r.status === "pending";
                return (
                  <TableRow key={r.id} className="border-border">
                    <TableCell className="py-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground">{name}</p>
                        <p className="text-[11px] text-muted-foreground">{email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono border-primary/30 text-primary"
                      >
                        {getAccessTierLabel(r.requested_tier)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate py-3 text-xs text-muted-foreground">
                      {r.reason ?? "Client recruitment desk access request"}
                    </TableCell>
                    <TableCell className="py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at || Date.now()).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge
                        variant="outline"
                        className={
                          r.status === "approved"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : r.status === "denied"
                              ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                              : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }
                      >
                        {r.status === "approved"
                          ? "Approved"
                          : r.status === "denied"
                            ? "Rejected"
                            : "Pending Review"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right py-3">
                      {isPending ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => handleAction(r.id, true, name)}
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                            onClick={() => handleAction(r.id, false, name)}
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground capitalize">{r.status}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function RecruiterRequestForm() {
  const { data: profile } = useProfile();
  const { isAuthenticated } = useSession();
  const queryClient = useQueryClient();
  const getMyRequestFn = useServerFn(getMyAccessRequest);
  const [tier, setTier] = useState<RequestableAccessTier | undefined>();
  const [reason, setReason] = useState("");
  const [draftGenerated, setDraftGenerated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionInFlight = useRef(false);

  const senderEmail = profile?.email || profile?.profile?.email || "Signed-in account";
  const senderName = profile?.profile?.full_name || "Current user";

  const requestFn = useServerFn(requestPlatformAccess);

  const { data: requestState, isPending: isLoadingRequest } = useQuery({
    queryKey: ["my-access-request"],
    queryFn: () => getMyRequestFn(),
    enabled: isAuthenticated,
    retry: 2,
  });

  const pendingRequest = requestState?.requests.find((request) => request.status === "pending");

  async function handleSubmit() {
    if (!tier) {
      toast.error("Please select a valid access tier.");
      return;
    }
    const normalizedReason = reason.trim();
    if (normalizedReason.length < ACCESS_REQUEST_REASON_MIN_LENGTH) {
      toast.error(`Please provide at least ${ACCESS_REQUEST_REASON_MIN_LENGTH} characters.`);
      return;
    }

    if (submissionInFlight.current || pendingRequest) return;
    submissionInFlight.current = true;
    setIsSubmitting(true);
    try {
      const result = await requestFn({ data: { requestedTier: tier, reason: normalizedReason } });
      toast.success(
        result.alreadyPending
          ? "Your access request is already pending approval."
          : "Access request submitted for approval.",
      );
      await queryClient.invalidateQueries({ queryKey: ["my-access-request"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit your request.");
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  }

  if (isLoadingRequest) {
    return (
      <Card className="border-border bg-card max-w-2xl mx-auto">
        <CardContent className="p-8 text-center text-xs text-muted-foreground">
          Loading your access request…
        </CardContent>
      </Card>
    );
  }

  if (pendingRequest) {
    return (
      <Card className="border-amber-500/30 bg-card max-w-2xl mx-auto">
        <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-3">
          <ShieldCheck className="h-10 w-10 text-amber-500" />
          <h3 className="text-base font-semibold text-foreground">
            Your access request is already pending approval.
          </h3>
          <div className="grid w-full max-w-md gap-2 rounded-md border border-border bg-muted/30 p-4 text-left text-xs sm:grid-cols-2">
            <span className="text-muted-foreground">Requested tier</span>
            <span className="font-semibold text-foreground sm:text-right">
              {getAccessTierLabel(pendingRequest.requested_tier)}
            </span>
            <span className="text-muted-foreground">Submitted</span>
            <span className="font-semibold text-foreground sm:text-right">
              {new Date(pendingRequest.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span className="text-muted-foreground">Current status</span>
            <span className="font-semibold text-amber-500 sm:text-right">Pending approval</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Crown className="h-4 w-4 text-primary" /> Request Recruiter Authorization
        </CardTitle>
        <CardDescription className="text-xs">
          Submit your account for access authorization to client requisitions and AI matching tools.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Request identity preview */}
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-1 text-xs">
          <p className="font-semibold text-primary">Request account:</p>
          <p className="text-muted-foreground">
            <strong>{senderName}</strong> ({senderEmail})
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Requested Access Tier</Label>
          <Select
            value={tier}
            onValueChange={(value) => {
              if (isRequestableAccessTier(value)) setTier(value);
            }}
          >
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Select access tier" />
            </SelectTrigger>
            <SelectContent>
              {ACCESS_TIER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Reason / Justification</Label>
          <Textarea
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={ACCESS_REQUEST_REASON_MAX_LENGTH}
            placeholder="e.g. Assigned to manage candidate bench and client requirements for FinTech & AI projects."
            className="text-xs"
          />
        </div>

        {/* Generate AI Draft button — shown when reason is entered but draft not yet generated */}
        {reason.trim().length > 0 && !draftGenerated && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => setDraftGenerated(true)}
          >
            <Sparkles className="h-3.5 w-3.5" /> Generate AI Email Draft
          </Button>
        )}

        {/* AI Email Draft Preview — shown only after clicking Generate */}
        {draftGenerated && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-3 text-xs font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-primary/20">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                  AI Email Draft Preview
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDraftGenerated(false)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                ✕ Dismiss
              </button>
            </div>
            <div className="space-y-1 text-[11px] text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">To:</span> Platform administrators
              </p>
              <p>
                <span className="font-medium text-foreground">From:</span> {senderName} &lt;
                {senderEmail}&gt;
              </p>
              <p>
                <span className="font-medium text-foreground">Subject:</span>{" "}
                <span className="text-primary font-semibold">
                  Platform Authorization Request — {tier ? getAccessTierLabel(tier) : "Access tier"}
                </span>
              </p>
            </div>
            <div className="space-y-2 text-[11px] leading-relaxed text-foreground border-t border-primary/20 pt-3">
              <p>Dear Administrator,</p>
              <p>
                I am writing to formally request elevated access to the Staffinix platform under the{" "}
                <strong>{tier ? getAccessTierLabel(tier) : "selected access"}</strong> tier. This
                authorization is required to effectively carry out my responsibilities within the
                recruitment operations team.
              </p>
              <p>
                <strong>Justification:</strong> {reason.trim()}
              </p>
              <p>
                I understand that this access grant carries operational responsibility and I commit
                to adhering to all platform usage policies, data governance standards, and security
                protocols as defined by the L3 Administration team.
              </p>
              <p>
                Please review this request at your earliest convenience. I am available to discuss
                further or provide any additional context required for approval.
              </p>
              <p className="pt-1">
                Warm regards,
                <br />
                <strong>{senderName}</strong>
                <br />
                {senderEmail}
              </p>
            </div>
          </div>
        )}

        <Button
          size="sm"
          onClick={handleSubmit}
          className="text-xs"
          disabled={
            isSubmitting || !tier || reason.trim().length < ACCESS_REQUEST_REASON_MIN_LENGTH
          }
        >
          <Mail className="h-3.5 w-3.5 mr-1.5" />
          {isSubmitting ? "Submitting…" : "Submit Access Request"}
        </Button>
      </CardContent>
    </Card>
  );
}
