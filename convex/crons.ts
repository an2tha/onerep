import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "delete expired Coach image uploads",
  { hours: 6 },
  internal.ai.coachState.cleanupExpiredUploads,
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
