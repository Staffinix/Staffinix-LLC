// Client-safe constants for submissions / interviews / placements UI.

export const SUBMISSION_STAGES = [
  "draft",
  "submitted",
  "vendor_review",
  "client_review",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;
export type SubmissionStage = (typeof SUBMISSION_STAGES)[number];

export const STAGE_LABEL: Record<SubmissionStage, string> = {
  draft: "Draft",
  submitted: "Submitted",
  vendor_review: "Vendor Review",
  client_review: "Client Review",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const STAGE_STYLE: Record<SubmissionStage, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  submitted: "bg-primary/15 text-primary border-primary/30",
  vendor_review: "bg-primary/10 text-primary border-primary/20",
  client_review: "bg-primary/10 text-primary border-primary/20",
  interview: "bg-warning/15 text-warning border-warning/30",
  offer: "bg-warning/20 text-warning border-warning/40",
  hired: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  withdrawn: "bg-muted text-muted-foreground border-border",
};

export const ACTIVE_STAGES: SubmissionStage[] = [
  "submitted",
  "vendor_review",
  "client_review",
  "interview",
  "offer",
];

export const PIPELINE_ORDER: SubmissionStage[] = [
  "draft",
  "submitted",
  "vendor_review",
  "client_review",
  "interview",
  "offer",
  "hired",
];

export const INTERVIEW_ROUNDS = [
  "screen",
  "l1",
  "l2",
  "manager",
  "client",
  "technical",
  "final",
  "other",
] as const;
export type InterviewRound = (typeof INTERVIEW_ROUNDS)[number];

export const ROUND_LABEL: Record<InterviewRound, string> = {
  screen: "Screen",
  l1: "L1",
  l2: "L2",
  manager: "Manager",
  client: "Client",
  technical: "Technical",
  final: "Final",
  other: "Other",
};

export const INTERVIEW_OUTCOMES = [
  "scheduled",
  "completed",
  "passed",
  "failed",
  "no_show",
  "rescheduled",
  "cancelled",
] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export const OUTCOME_STYLE: Record<InterviewOutcome, string> = {
  scheduled: "bg-primary/15 text-primary border-primary/30",
  completed: "bg-muted text-muted-foreground border-border",
  passed: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  no_show: "bg-destructive/10 text-destructive border-destructive/20",
  rescheduled: "bg-warning/15 text-warning border-warning/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export const OUTCOME_LABEL: Record<InterviewOutcome, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  passed: "Passed",
  failed: "Failed",
  no_show: "No show",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
};

export const PLACEMENT_STATUSES = ["active", "ended", "terminated", "extended"] as const;
export type PlacementStatus = (typeof PLACEMENT_STATUSES)[number];

export const PLACEMENT_STYLE: Record<PlacementStatus, string> = {
  active: "bg-success/15 text-success border-success/30",
  ended: "bg-muted text-muted-foreground border-border",
  terminated: "bg-destructive/15 text-destructive border-destructive/30",
  extended: "bg-primary/15 text-primary border-primary/30",
};
