import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "delete expired Coach image uploads",
  { hours: 6 },
  internal.ai.coachState.cleanupExpiredUploads,
  {},
);

crons.interval(
  "delete expired owned uploads",
  { hours: 1 },
  internal.uploads.cleanupExpired,
  {},
);

crons.interval(
  "delete expired rate limit buckets",
  { hours: 6 },
  internal.uploads.cleanupRateLimitBuckets,
  {},
);

// Webhooks are the fast path for subscription state; these sweeps are the
// safety net that turns a dropped notification into a delay, not an outage.
crons.interval(
  "revalidate due billing subscriptions",
  { hours: 6 },
  internal.billing.crons.revalidateDue,
  {},
);

crons.interval(
  "reconcile billing entitlement rollups",
  { hours: 24 },
  internal.billing.crons.reconcileRollups,
  {},
);

export default crons;
