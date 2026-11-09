import { useState } from "react"
import { createRoot } from "react-dom/client"
import { ConvexProvider, type ConvexReactClient } from "convex/react"
import { ConvexError } from "convex/values"
import { PALETTES, ThemeProvider, Toaster } from "@repo/ui"
import { AiKeySettings } from "../../../src/components/ai-key-settings"
import "../../../src/styles/index.css"
import "../../../src/i18n"

const params = new URLSearchParams(location.search)
const available = params.has("selfhosted")
let status = params.has("loading")
  ? undefined
  : {
      available,
      configured: params.has("configured"),
      last4: params.has("configured") ? "abcd" : null,
    }
const subscribers = new Set<() => void>()
const refresh = () => subscribers.forEach((callback) => callback())
let fail = params.has("fail")
const client = {
  watchQuery() {
    return {
      onUpdate(callback: () => void) {
        subscribers.add(callback)
        return () => subscribers.delete(callback)
      },
      localQueryResult: () => status,
      journal() {},
    }
  },
  async action(_reference: unknown, args: { key: string }) {
    await new Promise((resolve) => setTimeout(resolve, 200))
    if (fail)
      throw new ConvexError("This API key is invalid. Check it and try again.")
    status = { available, configured: true, last4: args.key.slice(-4) }
    refresh()
    return { last4: status.last4 }
  },
  async mutation() {
    await new Promise((resolve) => setTimeout(resolve, 200))
    if (fail) throw new Error("Couldn't remove the key")
    status = { available, configured: false, last4: null }
    refresh()
  },
}

function Fixture() {
  const [serverOpen, setServerOpen] = useState(false)
  return (
    <ConvexProvider client={client as unknown as ConvexReactClient}>
      <ThemeProvider identities={PALETTES} defaultTheme="system">
        <main className="mx-auto max-w-2xl py-6">
          <h1 className="px-[var(--app-page-x)] text-2xl font-semibold">
            Coach
          </h1>
          {serverOpen ? (
            <h2>Server settings</h2>
          ) : (
            <AiKeySettings onOpenServer={() => setServerOpen(true)} />
          )}
          <label className="mt-8 block px-6">
            <input
              type="checkbox"
              defaultChecked={fail}
              onChange={(event) => {
                fail = event.target.checked
              }}
            />{" "}
            Simulate failure
          </label>
        </main>
        <Toaster />
      </ThemeProvider>
    </ConvexProvider>
  )
}
createRoot(document.getElementById("root")!).render(<Fixture />)
