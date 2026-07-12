import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "delete expired Coach image uploads",
  { hours: 6 },
  internal.ai.coachState.cleanupExpiredUploads,
  {},
);

export default crons;
