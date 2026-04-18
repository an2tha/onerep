import { createTRPCClient, httpBatchLink } from "@trpc/client"
import type { AppRouter } from "../../../server/src/routers/_app"
import { authClient } from "./auth-client"

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
