import { useState } from "react"
import { Navigate, useLocation, useSearchParams } from "react-router"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { LinearModeDial } from "@/components/linear-mode-dial"
import { ReactiveOrbField } from "@/components/reactive-orb-field"
import Workouts from "./Workouts"
import Endurance from "./Endurance"

type TrainingMode = "strength" | "endurance"

export function LegacyEnduranceRedirect() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  params.set("mode", "endurance")
  return <Navigate to={`/workouts?${params}`} replace />
}

export default function Training() {
  const [params] = useSearchParams()
  const [mode, setMode] = useState<TrainingMode>(() => params.get("mode") === "endurance" ? "endurance" : "strength")
  const [shifting, setShifting] = useState(false)
  const reducedMotion = useReducedMotion()

  return (
    <div className="app-hero desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72">
      <ReactiveOrbField className="training-hero-wash" />
      <main className="app-page pb-28">
        <header className="app-header"><h1 className="app-title">Training</h1></header>
        <div className="training-family-dial">
          <LinearModeDial<TrainingMode>
            value={mode}
            modes={["strength", "endurance"]}
            labels={["Strength", "Endurance"]}
            ariaLabel="Training mode"
            curved
            arcRadius={650}
            step={160}
            onShiftingChange={setShifting}
            onChange={setMode}
          />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0 }}
            animate={{ opacity: shifting ? 0 : 1, transition: { duration: reducedMotion ? 0 : shifting ? 0.5 : 0.8, ease: "easeInOut" } }}
            exit={{ opacity: 0, transition: { duration: reducedMotion ? 0 : 0.5, ease: "easeInOut" } }}
          >
            {mode === "strength" ? <Workouts embedded /> : <Endurance embedded />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
