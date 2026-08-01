import { useEffect, useRef, useState } from "react"
import { celebrateOnce } from "./celebrations"

const MILESTONES = [1, 3, 7, 14, 30]

/**
 * Shared by StreakCard and StreakSmall so both react to the same crossing —
 * previously only the card knew a milestone had happened.
 */
export function useStreakMilestone(streak: number) {
  const [milestoneActive, setMilestoneActive] = useState(false)
  const previousStreak = useRef(streak)

  useEffect(() => {
    const crossed =
      streak > previousStreak.current && MILESTONES.includes(streak)
    previousStreak.current = streak
    if (!crossed) return
    if (!celebrateOnce("streak-milestone", String(streak))) return

    setMilestoneActive(true)
    const timer = window.setTimeout(() => setMilestoneActive(false), 1500)
    return () => window.clearTimeout(timer)
  }, [streak])

  return milestoneActive
}
