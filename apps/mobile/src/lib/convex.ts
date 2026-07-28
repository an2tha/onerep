import { ConvexReactClient } from "convex/react"

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined

export const convexServiceConfigured = Boolean(convexUrl)
export const convexClient = new ConvexReactClient(
  convexUrl ?? "https://onerep-convex-unconfigured.invalid",
  { expectAuth: true }
)
