import { createAuthClient } from "better-auth/react"
import {
  crossDomainClient,
  convexClient,
} from "@convex-dev/better-auth/client/plugins"

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL as string,
  plugins: [crossDomainClient(), convexClient()],
})
