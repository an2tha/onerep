import { useState } from "react"
import { createRoot } from "react-dom/client"
import { AddExerciseSheet } from "../../../src/pages/active-workout/add-exercise-sheet"
import { EXERCISES, type Exercise } from "../../../src/lib/exercise-catalog"
import "../../../src/styles/index.css"
import "../../../src/components/page-chrome.css"

async function search({ query = "" }: { query?: string } = {}) {
  await new Promise((resolve) => setTimeout(resolve, 300))
  return EXERCISES.filter((exercise) =>
    exercise.name.toLowerCase().includes(query.toLowerCase())
  )
}

function Fixture() {
  const [open, setOpen] = useState(false)
  const [added, setAdded] = useState<Exercise[]>([])
  const [, tick] = useState(0)
  return (
    <>
      <header className="collapsing-page-bar">
        <button aria-label="Back">Back</button>
        <button aria-label="Profile">Profile</button>
      </header>
      <main
        style={{
          transform: "translateZ(0)",
          paddingTop: 120,
          minHeight: "200vh",
        }}
      >
        <button onClick={() => setOpen(true)}>Add exercise</button>
        <button onClick={() => tick((value) => value + 1)}>Workout tick</button>
        <output>{added.map((exercise) => exercise.name).join(", ")}</output>
        {open && (
          <AddExerciseSheet
            addedIds={added.map((exercise) => exercise.id)}
            onAdd={(exercise) => setAdded((current) => [...current, exercise])}
            onClose={() => setOpen(false)}
            search={search}
          />
        )}
      </main>
    </>
  )
}

document.documentElement.classList.toggle(
  "dark",
  window.matchMedia("(prefers-color-scheme: dark)").matches
)
createRoot(document.getElementById("root")!).render(<Fixture />)
