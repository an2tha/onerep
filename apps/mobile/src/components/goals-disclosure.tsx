import { useId, useState, type ReactNode } from "react"
import { CaretDown } from "@phosphor-icons/react"

export function GoalsDisclosure({
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
  return (
    <div className="goals-disclosure" data-open={open}>
      <h4>
        <button
          type="button"
          id={`${id}-trigger`}
          aria-expanded={open}
          aria-controls={`${id}-content`}
          onClick={() => setOpen((value) => !value)}
        >
          <span>{title}</span>
          <CaretDown size={18} aria-hidden="true" />
        </button>
      </h4>
      <div
        id={`${id}-content`}
        className="goals-disclosure-body"
        role="region"
        aria-labelledby={`${id}-trigger`}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="goals-disclosure-clip">
          <div className="goals-disclosure-content">{children}</div>
        </div>
      </div>
    </div>
  )
}
