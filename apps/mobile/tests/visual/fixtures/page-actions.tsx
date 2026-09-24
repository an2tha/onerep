import { useLayoutEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  ArrowLeft,
  CalendarBlank,
  PencilSimple,
  Plus,
} from "@phosphor-icons/react"
import { PageBarActions } from "../../../src/components/page-bar-actions"
import {
  captureRouteSnapshot,
  restoreSnapshotScroll,
} from "../../../src/lib/route-snapshot"
import "../../../src/styles/index.css"
import "../../../src/components/page-chrome.css"

function Fixture() {
  const [result, setResult] = useState("")
  const [snapshot, setSnapshot] = useState<ReturnType<
    typeof captureRouteSnapshot
  > | null>(null)
  useLayoutEffect(() => {
    if (snapshot) window.scrollTo(0, 0)
  }, [snapshot])
  return (
    <>
      <header className="collapsing-page-bar" data-collapsed="false">
        <button className="page-bar-back" aria-label="Back">
          <ArrowLeft />
        </button>
        <span className="page-bar-title">Training</span>
        <div className="page-bar-tools">
          <div className="page-bar-actions" />
          <button className="profile-avatar" aria-label="Profile">
            AH
          </button>
        </div>
      </header>
      {snapshot && (
        <div
          className="app-route-frame app-route-frame-previous"
          data-page-bar={snapshot.pageBar}
          style={{ top: -snapshot.scrollY, bottom: "auto" }}
          ref={(node) => restoreSnapshotScroll(node, snapshot.scroll)}
          inert
          dangerouslySetInnerHTML={{ __html: snapshot.html }}
        />
      )}
      <main
        className="app-route-frame app-route-frame-current"
        data-page-bar="true"
      >
        <div style={{ minHeight: "200vh", paddingTop: 100 }}>
          <h1>Training</h1>
          <button
            style={{ marginTop: 400 }}
            onClick={() =>
              setSnapshot(
                captureRouteSnapshot(
                  document.querySelector<HTMLElement>(
                    ".app-route-frame-current"
                  )!
                )
              )
            }
          >
            Next page
          </button>
          <input aria-label="Draft reading" defaultValue="Initial" />
          <PageBarActions>
            <div style={{ display: "flex" }}>
              <button
                className="native-toolbar-button"
                aria-label="Workout date"
                onClick={() => setResult("Date opened")}
              >
                <CalendarBlank />
              </button>
              <button
                className="native-toolbar-button"
                aria-label="Edit reading"
                onClick={() => setResult("Editor opened")}
              >
                <PencilSimple />
              </button>
              <button
                className="native-toolbar-button"
                aria-label="Add reading"
                onClick={() => setResult("Add opened")}
              >
                <Plus />
              </button>
            </div>
          </PageBarActions>
          <output aria-live="polite">{result}</output>
        </div>
      </main>
    </>
  )
}
createRoot(document.getElementById("root")!).render(<Fixture />)
