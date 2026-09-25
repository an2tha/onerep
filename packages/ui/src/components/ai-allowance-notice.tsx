import { tr } from "../i18n"
import { X } from "@phosphor-icons/react"

export function AiAllowanceNotice({
  error,
  onClose,
}: {
  error: string | null
  onClose: () => void
}) {
  return (
    <div className="ai-hint-layer" role="presentation">
      <button
        type="button"
        className="ai-hint-scrim"
        aria-label={tr("Close")}
        onClick={onClose}
      />
      <div
        className="ai-hint-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-access-required-title"
      >
        <button
          type="button"
          className="ai-hint-close"
          aria-label={tr("Close")}
          onClick={onClose}
        >
          <X size={15} weight="bold" />
        </button>
        <h2 id="ai-access-required-title" className="ai-hint-title">
          {tr("Monthly AI allowance")}
        </h2>
        <p className="ai-hint-body">
          {tr(
            "Your AI allowance resets on the 1st of each month. Food and workout logging remain available."
          )}
        </p>
        {error && (
          <p className="ai-hint-note" role="status">
            {error}
          </p>
        )}
        <button type="button" className="ai-hint-cta" onClick={onClose}>
          {tr("Got it")}
        </button>
      </div>
    </div>
  )
}
