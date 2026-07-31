import { serve } from "bun";
import index from "./index.html";
import { getHistory, getSnapshot, knownTargets, startPolling } from "./monitor.ts";

startPolling();

const server = serve({
  port: Number(process.env.PORT) || 3001,
  routes: {
    // Serve the dashboard for all unmatched routes.
    "/*": index,

    "/api/status": {
      GET: () => Response.json(getSnapshot()),
    },

    "/api/history": {
      GET: (req) => {
        const target = new URL(req.url).searchParams.get("target") ?? "";
        const samples = getHistory(target);
        if (!samples) {
          return Response.json(
            { error: "unknown_target", known: knownTargets() },
            { status: 404 },
          );
        }
        return Response.json({ target, samples });
      },
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Dashboard running at ${server.url}`);
