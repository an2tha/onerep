import { useState } from "react"
import { createRoot } from "react-dom/client"
import {
  i18n,
  tr,
  UI_LANGUAGES,
  UI_LANGUAGE_KEY,
  type UiLanguage,
} from "@repo/ui/i18n"
import "../../../src/styles/index.css"

const params = new URLSearchParams(window.location.search)
const language = params.get("lang")
if (language && UI_LANGUAGES.includes(language as UiLanguage)) {
  localStorage.setItem(UI_LANGUAGE_KEY, language)
  await i18n.changeLanguage(language)
  params.delete("lang")
  history.replaceState(null, "", `${location.pathname}?${params}`)
}
const { setUiLanguage } = await import("../../../src/i18n")
const { SetupPreferences, parseSetupPreferences } =
  await import("../../../src/pages/onboarding/setup-preferences")
const { AiAccessRequiredModal } =
  await import("../../../src/components/billing/_private/payment-ui")
const { Calendar } = await import("@repo/ui/components/ui/calendar")
const languageNames = {
  en: "English",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  it: "Italiano",
  pt: "Português",
}

function Fixture() {
  const [preferences, setPreferences] = useState(parseSetupPreferences(null))
  const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">("kg")
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light")
  const [allowanceOpen, setAllowanceOpen] = useState(true)
  const surface = params.get("surface") ?? "preferences"
  return (
    <main className="app-page mx-auto max-w-2xl p-5">
      <label className="native-field">
        <span className="native-field-label">{tr("Language")}</span>
        <select
          aria-label={tr("Language")}
          value={i18n.language}
          onChange={(event) => setUiLanguage(event.target.value as UiLanguage)}
        >
          {UI_LANGUAGES.map((value) => (
            <option key={value} value={value}>
              {languageNames[value]}
            </option>
          ))}
        </select>
      </label>
      <h1 className="app-title my-5">{tr("Settings")}</h1>
      {surface === "preferences" && (
        <SetupPreferences
          section="preferences"
          waterGoalMl={2500}
          setWaterGoalMl={() => {}}
          onContinue={() => {}}
          value={preferences}
          onChange={setPreferences}
          theme={theme}
          setTheme={setTheme}
          identity="onerep"
          identities={[]}
          setIdentity={() => {}}
          weightUnit={weightUnit}
          setWeightUnit={setWeightUnit}
        />
      )}
      {surface === "calendar" && (
        <Calendar
          mode="single"
          defaultMonth={new Date(2026, 8, 24)}
          selected={new Date(2026, 8, 24)}
        />
      )}
      {surface === "billing" && (
        <AiAccessRequiredModal
          open={allowanceOpen}
          busy={false}
          price="4,99 €"
          error={null}
          freeLimit={10}
          proLimit={500}
          usedCount={10}
          isNative
          canPurchase
          canRestore
          onClose={() => setAllowanceOpen(false)}
          onOpenPaywall={() => {}}
          onOpenSettings={() => {}}
        />
      )}
      <output data-testid="saved-weight-unit">{weightUnit}</output>
    </main>
  )
}
createRoot(document.getElementById("root")!).render(<Fixture />)
