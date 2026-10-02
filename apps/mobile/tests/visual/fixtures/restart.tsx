import { useState } from "react"
import { shouldShowPageBar } from "../../../src/lib/navigation"
import { createRoot } from "react-dom/client"
import { RestartExperience } from "../../../src/components/restart/restart-experience"
import type { RestartPlan } from "../../../src/components/restart/restart-content"
import "../../../src/styles/index.css"
import "../../../src/components/page-chrome.css"
document.documentElement.classList.toggle(
  "dark",
  matchMedia("(prefers-color-scheme: dark)").matches,
)
function Fixture() {
  const params = new URLSearchParams(location.search)
  const [plan, setPlan] = useState<RestartPlan | null>(
    params.has("active")
      ? {
          status: "active",
          stage: 2,
          action: "walk",
          reason: "starting",
          anchor: "After school",
          lastActionOn: "2026-10-01",
        }
      : null,
  )
  const [closed, setClosed] = useState(false)
  const [fail, setFail] = useState(params.has("fail"))
  if (closed)
    return <button onClick={() => setClosed(false)}>Reopen restart</button>
  return (
    <div className="app-route-shell">
      <div className="app-route-stack">
        <div
          className="app-route-frame app-route-frame-current"
          data-route-path="/restart"
          data-page-bar={
            shouldShowPageBar("/restart", true) ? "true" : undefined
          }
        >
          <RestartExperience
            preview={params.has("preview")}
            plan={plan}
            today="2026-10-02"
            draftKey="restart-fixture"
            onSave={async (choices) => {
              await new Promise((resolve) => setTimeout(resolve, 250))
              if (fail) {
                setFail(false)
                throw new Error("Offline")
              }
              setPlan({ ...choices, status: "active", stage: plan?.stage ?? 0 })
            }}
            onAdvance={async (stage) =>
              setPlan((p) =>
                p
                  ? {
                      ...p,
                      stage: stage + 1,
                      lastActionOn: "2026-10-02",
                      status: stage >= 2 ? "completed" : "active",
                    }
                  : null,
              )
            }
            onPause={async () =>
              setPlan((p) => (p ? { ...p, status: "paused" } : p))
            }
            onClose={() => setClosed(true)}
            onNavigate={() => setClosed(true)}
          />
        </div>
      </div>
    </div>
  )
}
createRoot(document.getElementById("root")!).render(<Fixture />)
