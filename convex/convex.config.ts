import { defineApp } from "convex/server";
import { v } from "convex/values";
import crons from "@convex-dev/crons/convex.config.js";

const app = defineApp({
  env: {
    OPENAI_API_KEY: v.optional(v.string()),
    OPENAI_WORKOUT_PRESET_MODEL: v.optional(v.string()),
  },
});
app.use(crons);
export default app;
