import { createTRPCClient, httpBatchLink } from "@trpc/client"
import { authClient } from "./auth-client"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppRouter = any

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${import.meta.env.VITE_SERVER_URL ?? "http://192.168.50.216:3000"}/trpc`,
      headers() {
        const cookie = authClient.getCookie()
        return cookie ? { cookie } : {}
      },
    }),
  ],
})
