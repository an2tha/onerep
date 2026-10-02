import { motion, useReducedMotion } from "framer-motion"

/** Three stepping stones and a returning path, drawn as precise geometry. */
export function RestartArt({
  progress = 0,
  compact = false,
}: {
  progress?: number
  compact?: boolean
}) {
  const reduced = useReducedMotion()
  const fraction = Math.min(1, Math.max(0.08, progress / 3))
  return (
    <svg
      className={`restart-art ${compact ? "is-compact" : ""}`}
      viewBox="0 0 400 340"
      fill="none"
      aria-hidden="true"
    >
      <g className="restart-art-contours" stroke="currentColor" strokeWidth="1">
        <path d="M-20 286C70 286 66 214 160 214S275 116 420 116" />
        <path d="M-20 302C84 302 74 230 168 230S287 132 420 132" />
        <path d="M-20 318C98 318 82 246 176 246S299 148 420 148" />
        <path d="M-20 334C112 334 90 262 184 262S311 164 420 164" />
      </g>
      <path
        className="restart-art-track"
        d="M60 245C60 174 197 238 197 166S332 171 332 89"
        strokeWidth="2"
        strokeDasharray="3 7"
      />
      <motion.path
        className="restart-art-ink"
        d="M60 245C60 174 197 238 197 166S332 171 332 89"
        strokeWidth="3"
        strokeLinecap="round"
        initial={false}
        animate={{ pathLength: fraction }}
        transition={{ duration: reduced ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] }}
      />
      {[
        [60, 245],
        [197, 166],
        [332, 89],
      ].map(([x, y], i) => (
        <motion.g
          key={i}
          initial={false}
          animate={{ y: progress > i ? -3 : 0 }}
          transition={{ duration: reduced ? 0 : 0.5 }}
        >
          <circle cx={x} cy={y} r="26" className="restart-art-stone" />
          <circle
            cx={x}
            cy={y}
            r="19"
            className={progress > i ? "restart-art-done" : "restart-art-wait"}
          />
          {progress > i ? (
            <path
              d={`M${x - 6} ${y}l4 4 8-8`}
              className="restart-art-check"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <circle cx={x} cy={y} r="3" fill="currentColor" />
          )}
        </motion.g>
      ))}
      <g
        className="restart-art-sun"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <circle cx="87" cy="83" r="14" />
        <path d="M87 58V51M87 108V115M62 83H55M112 83H119M69 65L64 60M105 101L110 106M69 101L64 106M105 65L110 60" />
      </g>
    </svg>
  )
}
