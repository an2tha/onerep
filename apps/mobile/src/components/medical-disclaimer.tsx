/**
 * The one place the "not a medical device" sentence lives.
 *
 * It has to appear in the app, not only in the Terms behind an external link,
 * because the app is the thing telling you to eat 2,300 calories and that your
 * knee travelled too far forward. It also has to say the same thing in every
 * place it appears, which is why this is a component and not a paragraph
 * somebody retypes: two disclaimers that disagree are worse than one.
 *
 * `tone="panel"` for a step someone is reading on purpose — the end of
 * onboarding, where targets have just been produced. `tone="footnote"` for the
 * bottom of a screen they are only passing through.
 */
export function MedicalDisclaimer({
  tone = "footnote",
  className,
}: {
  tone?: "panel" | "footnote"
  className?: string
}) {
  const body = (
    <>
      OneRep is a fitness and food diary, not a medical device. Targets, Coach
      answers, and form feedback are estimates, not a diagnosis, a treatment, or
      medical advice. Talk to a doctor before you change how you eat or train —
      and if something hurts, stop and get it looked at.
    </>
  )

  if (tone === "panel") {
    return (
      <div
        role="note"
        className={[
          "rounded-[var(--radius-card)] border border-border bg-[var(--surface-panel)] p-4",
          "text-[13px] leading-5 text-muted-foreground",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {body}
      </div>
    )
  }

  return (
    <p
      role="note"
      className={[
        "native-row-detail px-[var(--app-page-x)] text-center text-balance",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {body}
    </p>
  )
}
