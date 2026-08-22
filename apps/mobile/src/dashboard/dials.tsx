import {
  HoldToStartDial,
  TrainingStatDial,
} from "@/components/training-hero-dials"

// The same crown the training hero wears, shrunk to sit beside the greeting:
// the thing you act on holds the middle and the two readings tuck behind its
// lower edge. Reusing those dials rather than drawing new ones is the point —
// a reading here and the same reading on Workouts should be the same object.

// The dials draw their text into an `inset-[16%]` box, so the diameter sets
// the room a label gets — roughly two thirds of it. Under about 60px even
// "62%" spills over the ring, which is what these were doing at 54.
const DIAL = 64
const HOLD = 88
const ORBIT = 58

// Left and right of the hold dial's lower arc. Mirrored so each reading fills
// away from the centre instead of sweeping underneath it.
const SATELLITES = [
  { angle: 148, mirrored: true },
  { angle: 32, mirrored: false },
]

export function DashboardDials({
  nutritionPercent,
  recoveryScore,
  onStartWorkout,
  onOpenNutrition,
  onOpenRecovery,
}: {
  /** How much of today's nutrition targets are met, 0-100. */
  nutritionPercent: number | null
  /** Today's recovery score, 0-100. */
  recoveryScore: number | null
  onStartWorkout: () => void
  onOpenNutrition?: () => void
  onOpenRecovery?: () => void
}) {
  const width = HOLD + ORBIT + DIAL / 2
  const height = HOLD + ORBIT * 0.62
  const centreX = width / 2

  const readings = [
    {
      name: "Fuel",
      value: Math.round(nutritionPercent ?? 0),
      target: 100,
      suffix: "%",
      color: "var(--accent-food)",
      onClick: onOpenNutrition,
    },
    {
      // "Recovery" is four characters too many for a dial this size; the
      // reading is the number, and "Ready" says the same thing in the room
      // available.
      name: "Ready",
      value: Math.round(recoveryScore ?? 0),
      target: 100,
      suffix: "",
      color: "var(--accent-training-hero)",
      onClick: onOpenRecovery,
    },
  ]

  return (
    <div className="relative" style={{ width, height }}>
      {SATELLITES.map((satellite, index) => {
        const reading = readings[index]
        const radians = (satellite.angle * Math.PI) / 180
        return (
          <button
            key={reading.name}
            type="button"
            onClick={reading.onClick}
            disabled={!reading.onClick}
            aria-label={`${reading.name}: ${reading.value}${reading.suffix}`}
            className="motion-tactile absolute z-0 rounded-full"
            style={{
              left: centreX + ORBIT * Math.cos(radians) - DIAL / 2,
              top: HOLD / 2 + ORBIT * Math.sin(radians) - DIAL / 2,
            }}
          >
            <TrainingStatDial
              name={reading.name}
              value={reading.value}
              target={reading.target}
              suffix={reading.suffix}
              color={reading.color}
              size={DIAL}
              stroke={6}
              mirrored={satellite.mirrored}
            />
          </button>
        )
      })}
      <div
        className="absolute z-10"
        style={{ left: centreX - HOLD / 2, top: 0 }}
      >
        <HoldToStartDial
          label="Open workout"
          onComplete={onStartWorkout}
          size={HOLD}
          stroke={8}
          color="var(--accent-training-hero)"
        />
      </div>
    </div>
  )
}
