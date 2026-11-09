import { createRoot } from "react-dom/client"
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { convexClient } from "./lib/convex"
import { providerAuthClient } from "./lib/auth-client"
import DeveloperConsole from "./pages/DeveloperConsole"

createRoot(document.getElementById("root")!).render(
  <ConvexBetterAuthProvider
    client={convexClient}
    authClient={providerAuthClient}
  >
    <DeveloperConsole />
  </ConvexBetterAuthProvider>,
)
