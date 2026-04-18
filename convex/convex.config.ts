import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import crons from "@convex-dev/crons/convex.config.js";

const app = defineApp();
app.use(betterAuth);
app.use(crons);
export default app;
