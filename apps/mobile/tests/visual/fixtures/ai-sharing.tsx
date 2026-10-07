import { useState } from "react"
import { createRoot } from "react-dom/client"
import { ConvexProvider, type ConvexReactClient } from "convex/react"
import { ThemeProvider, PALETTES, Toaster } from "@repo/ui"
import { AiSharingSettings, AiSharingConsentSheet } from "../../../src/components/ai-sharing-consent"
import "../../../src/styles/index.css"
import "../../../src/i18n"

const params = new URLSearchParams(location.search)
let preferences: { aiSharingConsent?: { granted: boolean; version: number } } | null | undefined =
  params.has("loading") ? undefined : params.has("off") ? { aiSharingConsent: { granted: false, version: 2 } } : null
let fail = params.has("fail")
const subscribers = new Set<() => void>()
const refresh = () => subscribers.forEach(callback => callback())
const client = {
  watchQuery() {
    return {
      onUpdate(callback: () => void) { subscribers.add(callback); return () => subscribers.delete(callback) },
      localQueryResult: () => preferences,
      journal() {},
    }
  },
  async mutation(_reference: unknown, args: { granted: boolean; version: number }) {
    await new Promise(resolve => setTimeout(resolve, 150))
    if (fail) throw new Error("Simulated network failure")
    preferences = { aiSharingConsent: args }
    sessionStorage.setItem("ai-sharing-saved", JSON.stringify(args))
    refresh()
    return null
  },
}

function Fixture() {
  const [sheetOpen, setSheetOpen] = useState(params.has("sheet"))
  return (
    <ConvexProvider client={client as unknown as ConvexReactClient}>
      <ThemeProvider identities={PALETTES} defaultTheme="light">
        <main className="mx-auto max-w-2xl py-6">
          <h1 className="px-[var(--app-page-x)] text-2xl font-semibold">Privacy & sync</h1>
          <AiSharingSettings />
          <div className="p-4">
            <label><input type="checkbox" defaultChecked={fail} onChange={event => { fail = event.target.checked }} /> Simulate failed save</label>
            <button onClick={() => { preferences = { aiSharingConsent: { granted: false, version: 2 } }; refresh() }}>Load saved opt-out</button>
          </div>
          {sheetOpen && <AiSharingConsentSheet onClose={() => setSheetOpen(false)} />}
        </main>
        <Toaster />
      </ThemeProvider>
    </ConvexProvider>
  )
}
createRoot(document.getElementById("root")!).render(<Fixture />)
