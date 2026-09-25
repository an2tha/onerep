import { Fragment, type ReactNode } from "react"
import i18n from "i18next"
import { initReactI18next, useTranslation } from "react-i18next"
import de from "./locales/de.json"
import es from "./locales/es.json"
import fr from "./locales/fr.json"
import it from "./locales/it.json"
import pt from "./locales/pt.json"
import errorMessages from "./locales/error-messages.json"

export const UI_LANGUAGES = ["en", "es", "fr", "de", "it", "pt"] as const
export type UiLanguage = (typeof UI_LANGUAGES)[number]
export const UI_LANGUAGE_KEY = "onerep:ui-language"

export function isUiLanguage(value: unknown): value is UiLanguage {
  return (
    typeof value === "string" &&
    (UI_LANGUAGES as readonly string[]).includes(value)
  )
}

export function storedUiLanguage(): UiLanguage | null {
  try {
    const value = globalThis.localStorage?.getItem(UI_LANGUAGE_KEY)
    return isUiLanguage(value) ? value : null
  } catch {
    return null
  }
}

function initialLanguage(): UiLanguage {
  const stored = storedUiLanguage()
  if (stored) return stored
  if (typeof navigator !== "undefined") {
    for (const candidate of navigator.languages ?? [navigator.language]) {
      const base = candidate?.split("-")[0]?.toLowerCase()
      if (isUiLanguage(base)) return base
    }
  }
  return "en"
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { app: {} },
    de: { app: de },
    es: { app: es },
    fr: { app: fr },
    it: { app: it },
    pt: { app: pt },
  },
  lng: initialLanguage(),
  supportedLngs: [...UI_LANGUAGES],
  fallbackLng: "en",
  defaultNS: "translation",
  initAsync: false,
  interpolation: { escapeValue: false },
})

export function uiLocale(): string {
  return i18n.resolvedLanguage ?? i18n.language ?? "en"
}

export function speechLocale(): string {
  const locales: Record<string, string> = {
    en: "en-US",
    de: "de-DE",
    es: "es-ES",
    fr: "fr-FR",
    it: "it-IT",
    pt: "pt-PT",
  }
  return locales[uiLocale()] ?? "en-US"
}

export function weekdayLabel(
  day: number,
  width: "narrow" | "short" | "long" = "short"
): string {
  return new Intl.DateTimeFormat(uiLocale(), {
    weekday: width,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, 0, 7 + day)))
}

/** Select a complete message before translating, never append an English plural suffix. */
export function messageVariant(
  source: string,
  values: Record<string, unknown> = {}
): string {
  const selected = source.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = values[key]
    return isChoice(value) ? value.text : match
  })
  if (
    i18n.exists(selected, {
      ns: "app",
      keySeparator: false,
      nsSeparator: false,
    })
  )
    return selected
  const plural = selected.replace(
    /([A-Za-z])\{\{(value\d+)\}\}/g,
    (match, letter: string, key: string) => {
      const suffix = values[key]
      return suffix === "s" || suffix === "" ? letter + suffix : match
    }
  )
  // An empty optional sentence fragment is not necessarily a plural suffix.
  // Only select a plural variant that has a corresponding translated message.
  return plural !== selected &&
    uiLocale() !== "en" &&
    !i18n.exists(plural, { ns: "app", keySeparator: false, nsSeparator: false })
    ? selected
    : plural
}

const MESSAGE_CHOICE = Symbol("message choice")
type MessageChoice = {
  readonly kind: typeof MESSAGE_CHOICE
  readonly text: string
}
export function choice(text: string): MessageChoice {
  return { kind: MESSAGE_CHOICE, text }
}
function isChoice(value: unknown): value is MessageChoice {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === MESSAGE_CHOICE
  )
}

function displayValue<T>(value: T): T | string {
  if (isChoice(value)) return value.text
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat(uiLocale(), {
        useGrouping: false,
        maximumFractionDigits: 20,
      }).format(value)
    : value
}

/** Source messages remain readable in code; variable values are never translated. */
export function tr(source: string, values?: Record<string, unknown>): string {
  const message = messageVariant(source, values)
  return i18n.t(message, {
    ns: "app",
    keySeparator: false,
    nsSeparator: false,
    defaultValue: message,
    ...Object.fromEntries(
      Object.entries(values ?? {}).map(([key, value]) => [
        key,
        displayValue(value),
      ])
    ),
  }) as string
}

const errorPatterns = errorMessages
  .filter((source) => source.includes("{{"))
  .map((source) => {
    const keys: string[] = []
    const pattern = source
      .split(/(\{\{\w+\}\})/g)
      .map((part) => {
        const match = /^\{\{(\w+)\}\}$/.exec(part)
        if (match) {
          keys.push(match[1])
          return "([\\s\\S]*?)"
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      })
      .join("")
    return { source, keys, pattern: new RegExp(`^${pattern}$`) }
  })

/** Translate known product errors at the display boundary; keep their original identity. */
export function translateError<T>(message: T): T | string {
  if (typeof message !== "string") return message
  if (errorMessages.includes(message)) return tr(message)
  for (const entry of errorPatterns) {
    const match = entry.pattern.exec(message)
    if (match)
      return tr(
        entry.source,
        Object.fromEntries(entry.keys.map((key, i) => [key, match[i + 1]]))
      )
  }
  return message
}

/** Keep a complete sentence translatable even when it contains links or controls. */
export function Message({
  text,
  values,
}: {
  text: string
  values: Record<string, ReactNode | MessageChoice>
}) {
  const { t } = useTranslation("app")
  const message = messageVariant(text, values)
  const markers = Object.fromEntries(
    Object.keys(values).map((key) => [key, `{{${key}}}`])
  )
  const translated = t(message, {
    keySeparator: false,
    nsSeparator: false,
    defaultValue: message,
    ...markers,
  }) as string
  return (
    <>
      {translated.split(/(\{\{\w+\}\})/g).map((part, index) => {
        const match = /^\{\{(\w+)\}\}$/.exec(part)
        return (
          <Fragment key={index}>
            {match && Object.prototype.hasOwnProperty.call(values, match[1])
              ? (displayValue(values[match[1]]) as ReactNode)
              : part}
          </Fragment>
        )
      })}
    </>
  )
}

export { i18n }
