import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { PrimaryButton, toast } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import {
  AI_SHARING_VERSION,
  AI_SHARING_RECIPIENTS,
  AI_SHARING_DATA,
  AI_SHARING_PURPOSE,
  hasAiSharingConsent,
} from "../../../../convex/lib/aiSharing"
import { MobileSheet } from "./mobile-sheet"

export function AiSharingDisclosure() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
      <p>
        <strong className="text-foreground">Who receives your data:</strong>{" "}
        {AI_SHARING_RECIPIENTS}
      </p>
      <p>
        <strong className="text-foreground">What is sent:</strong>{" "}
        {AI_SHARING_DATA}
      </p>
      <p>{AI_SHARING_PURPOSE}</p>
      <p>
        You can turn sharing off in Settings → Privacy &amp; sync. This stops
        future AI requests; it cannot recall data already sent.
      </p>
      <p>
        <a
          className="underline underline-offset-4"
          href="https://onerep.life/privacy#ai"
          target="_blank"
          rel="noreferrer"
        >
          Privacy policy and provider protections
        </a>
      </p>
    </div>
  )
}

export function AiSharingConsentSheet({ onClose }: { onClose: () => void }) {
  const save = useMutation(api.ai.usage.setSharingConsent)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <MobileSheet
      ariaLabel="Allow AI data sharing?"
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <div className="space-y-5 px-5 py-6">
        <h2 className="text-xl font-semibold">Allow AI data sharing?</h2>
        <AiSharingDisclosure />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <PrimaryButton
          disabled={busy}
          onClick={() => {
            setBusy(true)
            setError(null)
            void save({ granted: true, version: AI_SHARING_VERSION })
              .then(() => {
                toast.message(
                  "AI sharing enabled. You can now use your chosen AI feature.",
                )
                onClose()
              })
              .catch(() =>
                setError(
                  "Could not save your permission. No AI request was started. Try again.",
                ),
              )
              .finally(() => setBusy(false))
          }}
        >
          {busy ? "Saving…" : "Allow AI data sharing"}
        </PrimaryButton>
        <button
          type="button"
          className="min-h-11 w-full text-sm font-medium"
          disabled={busy}
          onClick={onClose}
        >
          Not now
        </button>
      </div>
    </MobileSheet>
  )
}

export function AiSharingSettings() {
  const preferences = useQuery(api.users.users.getPreferences)
  const save = useMutation(api.ai.usage.setSharingConsent)
  const allowed = hasAiSharingConsent(preferences?.aiSharingConsent)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <section
      className="space-y-4 px-[var(--app-page-x)] py-4"
      aria-label="AI data sharing"
    >
      <h3 className="font-semibold">
        AI data sharing · {allowed ? "On" : "Off"}
      </h3>
      <AiSharingDisclosure />
      <PrimaryButton
        disabled={busy || preferences === undefined}
        onClick={() => {
          if (!allowed) {
            setOpen(true)
            return
          }
          setBusy(true)
          void save({ granted: false, version: AI_SHARING_VERSION })
            .catch(() =>
              toast.error("Could not turn off AI sharing. Try again."),
            )
            .finally(() => setBusy(false))
        }}
      >
        {busy
          ? "Saving…"
          : allowed
            ? "Turn off AI data sharing"
            : "Review AI permission"}
      </PrimaryButton>
      {open && <AiSharingConsentSheet onClose={() => setOpen(false)} />}
    </section>
  )
}
