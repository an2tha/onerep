import { useId, useState, type ReactNode } from "react"
import { CaretDown } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

type AnimatedAccordionProps = {
  summary: ReactNode | ((open: boolean) => ReactNode)
  children: ReactNode
  className?: string
  triggerClassName?: string
  contentClassName?: string
  defaultOpen?: boolean
}

export function AnimatedAccordion({
  summary,
  children,
  className,
  triggerClassName,
  contentClassName,
  defaultOpen = false,
}: AnimatedAccordionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()
  const summaryContent = typeof summary === "function" ? summary(open) : summary

  return (
    <section
      className={className}
      data-accordion-state={open ? "open" : "closed"}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-3 text-left",
          triggerClassName
        )}
      >
        <span className="min-w-0 flex-1">{summaryContent}</span>
        <CaretDown
          size={18}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform duration-[var(--motion-medium)] ease-[var(--motion-ease-standard)] motion-reduce:transition-none",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      <div
        id={contentId}
        aria-hidden={!open}
        inert={!open ? true : undefined}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-[var(--motion-medium)] ease-[var(--motion-ease-standard)] motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={contentClassName}>{children}</div>
        </div>
      </div>
    </section>
  )
}
