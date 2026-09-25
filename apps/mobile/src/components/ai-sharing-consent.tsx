import { Message, choice, tr, translateError } from "@repo/ui/i18n"
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

export function AiSharingDisclosure({
  concise = false,
}: {
  concise?: boolean
}) {
  if (concise) {
    return (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <div className="rounded-xl bg-muted/55 px-4 py-3">
          <p className="font-semibold text-foreground">
            {tr("Zero-data retention is enabled")}
          </p>
          <p className="mt-1">
            {tr(
              "Your privacy is protected. AI providers can process your request, but they cannot store it or use it to train their models."
            )}
          </p>
        </div>
        <div className="space-y-2.5">
          <p>
            <Message
              text={
                "{{value0}} Only the information needed for the AI feature you choose—such as your message, photo, or relevant health and fitness details."
              }
              values={{
                value0: (
                  <strong className="text-foreground">
                    {tr("What’s shared:")}
                  </strong>
                ),
              }}
            />
          </p>
          <p>
            <Message
              text={
                "{{value0}} OpenRouter securely routes it to Microsoft Azure or Venice."
              }
              values={{
                value0: (
                  <strong className="text-foreground">
                    {tr("Who processes it:")}
                  </strong>
                ),
              }}
            />
          </p>
        </div>
        <p>
          <Message
            text={
              "AI is optional. You can turn it off anytime in Settings. {{value0}}"
            }
            values={{
              value0: (
                <a
                  className="underline underline-offset-4"
                  href="https://onerep.life/privacy#ai"
                  target="_blank"
                  rel="noreferrer"
                >
                  {tr("How your privacy is protected")}
                </a>
              ),
            }}
          />
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
      <p>
        <strong className="text-foreground">
          {tr("Who receives your data:")}
        </strong>{" "}
        {AI_SHARING_RECIPIENTS}
      </p>
      <p>
        <strong className="text-foreground">{tr("What is sent:")}</strong>{" "}
        {AI_SHARING_DATA}
      </p>
      <p>{AI_SHARING_PURPOSE}</p>
      <p>
        {tr(
          "You can turn sharing off in Settings → Privacy & sync. This stops future AI requests; it cannot recall data already sent."
        )}
      </p>
      <p>
        <a
          className="underline underline-offset-4"
          href="https://onerep.life/privacy#ai"
          target="_blank"
          rel="noreferrer"
        >
          {tr("Privacy policy and provider protections")}
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
      ariaLabel={tr("Use AI features?")}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <div className="space-y-5 px-5 py-6">
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold">{tr("Use AI features?")}</h2>
          <p className="text-sm text-muted-foreground">
            {tr(
              "OneRep needs your permission before sending anything to an AI provider."
            )}
          </p>
        </div>
        <AiSharingDisclosure concise />
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
                toast.message(tr("AI features are ready to use."))
                onClose()
              })
              .catch(() =>
                setError(
                  translateError(
                    tr(
                      "Could not save your permission. No AI request was started. Try again."
                    )
                  )
                )
              )
              .finally(() => setBusy(false))
          }}
        >
          {busy ? tr("Turning on…") : tr("Turn on AI features")}
        </PrimaryButton>
        <button
          type="button"
          className="min-h-11 w-full text-sm font-medium"
          disabled={busy}
          onClick={onClose}
        >
          {tr("Not now")}
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
      aria-label={tr("AI data sharing")}
    >
      <h3 className="font-semibold">
        <Message
          text={"AI data sharing · {{value0}}"}
          values={{ value0: choice(allowed ? "On" : "Off") }}
        />
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
              toast.error(
                translateError(tr("Could not turn off AI sharing. Try again."))
              )
            )
            .finally(() => setBusy(false))
        }}
      >
        {busy
          ? tr("Saving…")
          : allowed
            ? tr("Turn off AI data sharing")
            : tr("Review AI permission")}
      </PrimaryButton>
      {open && <AiSharingConsentSheet onClose={() => setOpen(false)} />}
    </section>
  )
}
