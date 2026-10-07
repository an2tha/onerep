import { useId, useState, type CSSProperties, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { CaretDown } from "@phosphor-icons/react"

const ease = [0.22, 0.61, 0.36, 1] as const

export function ProgrammeAccordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  const reduced = useReducedMotion()
  return (
    <div className="programme-accordion" data-open={open}>
      <button
        type="button"
        id={`${id}-trigger`}
        className="programme-accordion-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        <CaretDown size={16} aria-hidden="true" />
      </button>
      <motion.div
        id={id}
        role="region"
        aria-labelledby={`${id}-trigger`}
        className="programme-accordion-panel"
        inert={!open || undefined}
        aria-hidden={!open}
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 0.48, ease }}
      >
        <div className="programme-accordion-content">{children}</div>
      </motion.div>
    </div>
  )
}

/** Deterministic CSS particles keep the transition light on mobile GPUs. */
export function ProgrammeStars() {
  return (
    <div className="programmes-stars" aria-hidden="true">
      {Array.from({ length: 32 }, (_, index) => (
        <i
          key={index}
          style={
            {
              "--x": `${(index * 37 + 11) % 100}%`,
              "--y": `${(index * 61 + 7) % 100}%`,
              "--delay": `${(index % 7) * 35}ms`,
              "--size": `${index % 5 === 0 ? 3 : 1.5}px`,
              "--travel": `${36 + (index % 5) * 18}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

export function ProgrammeTransition({
  viewKey,
  children,
}: {
  viewKey: string
  children: ReactNode
}) {
  const reduced = useReducedMotion()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={viewKey}
        className="programme-view"
        data-motion="entering"
        initial={{ opacity: 0, y: reduced ? 0 : 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : -12 }}
        transition={{ duration: reduced ? 0 : 0.65, ease }}
      >
        <ProgrammeStars />
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
