import { useCallback, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  ProgrammeSetup,
  newSetupDraft,
  type SetupDraft,
} from "../../../src/components/programmes/setup"
import "../../../src/styles/index.css"
import "../../../src/components/programmes/programmes.css"

const parameters = new URLSearchParams(location.search)
const initial = newSetupDraft("both")
initial.step = Number(parameters.get("step") ?? 0)
initial.settings = {
  ...initial.settings,
  name: "A steadier routine",
  equipment: ["Dumbbells"],
  screeningConfirmed: true,
}
function Fixture() {
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [closed, setClosed] = useState(false)
  const save = useCallback(
    (draft: SetupDraft) =>
      sessionStorage.setItem("programme-setup-preview", JSON.stringify(draft)),
    [],
  )
  return closed ? (
    <p>Setup saved</p>
  ) : (
    <ProgrammeSetup
      initial={initial}
      error={error}
      busy={busy}
      onSaveDraft={save}
      onClose={() => setClosed(true)}
      onComplete={async (draft) => {
        save(draft)
        setBusy(true)
        await new Promise((resolve) => setTimeout(resolve, 100))
        setError(
          "Generation unavailable in this preview. Your answers are saved.",
        )
        setBusy(false)
      }}
    />
  )
}
const previewRoot = createRoot(document.getElementById("root")!)
import.meta.hot?.dispose(() => previewRoot.unmount())
previewRoot.render(<Fixture />)
