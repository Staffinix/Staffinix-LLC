const disabledMessage =
  "Development fixtures are disabled. This page must be connected to an authorized production API.";

throw new Error(disabledMessage);

export const MASTER_CLIENTS: never[] = [];
export const MASTER_VENDORS: never[] = [];
export const MASTER_CANDIDATES: never[] = [];
export const MASTER_REQUISITIONS: never[] = [];
export const MASTER_SUBMISSIONS: never[] = [];
export const MASTER_INTERVIEWS: never[] = [];
export const MASTER_PLACEMENTS: never[] = [];
export const MASTER_AUDIT_LOGS: never[] = [];

export const RISK_META = {};
export const TAILORING_FLAGS: never[] = [];
export const SOURCE_RESUME = "";
export const TAILORED_RESUME_WITH_CLAIM = "";
export const TAILORED_RESUME_CLEAN = "";
