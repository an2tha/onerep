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
  "delete spent OAuth codes and refresh tokens",
  { hours: 12 },
  internal.mcp.oauth.purgeExpired,
  {},
);

crons.interval(
  "delete expired rate limit buckets",
  { hours: 6 },
  internal.uploads.cleanupRateLimitBuckets,
  {},
);

// 15 minutes bounds how late an auto-logged meal can be; "log my oats at
// 7:00" landing by 7:15 is fine, landing at noon is not.
crons.interval(
  "log due repeat meals",
  { minutes: 15 },
  internal.logs.repeatMeals.logDueMeals,
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

// Coach outreach. Hourly because Sunday evening arrives at twenty-four
// different moments and a cron only knows UTC; each sweep selects the handful
// of timezones for which it is now the right time. Every one of these is a
// no-op unless COACH_PROACTIVE_ENABLED is set.
crons.interval(
  "generate due weekly reviews",
  { hours: 1 },
  internal.ai.weeklyReview.enqueueDue,
  {},
);

crons.interval(
  "send due coach nudges",
  { hours: 1 },
  internal.ai.nudges.sweep,
  {},
);

crons.interval(
  "expire unanswered weekly reviews",
  { hours: 12 },
  internal.ai.weeklyReview.expireStale,
  {},
);

export default crons;
