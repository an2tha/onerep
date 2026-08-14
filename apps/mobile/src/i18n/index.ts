import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import en from "./locales/en.json"
import es from "./locales/es.json"
import fr from "./locales/fr.json"
import de from "./locales/de.json"
import it from "./locales/it.json"
import pt from "./locales/pt.json"

export const UI_LANGUAGES = ["en", "es", "fr", "de", "it", "pt"] as const
export type UiLanguage = (typeof UI_LANGUAGES)[number]

const UI_LANGUAGE_KEY = "onerep:ui-language"

function isUiLanguage(value: string | null): value is UiLanguage {
  return value != null && (UI_LANGUAGES as readonly string[]).includes(value)
}

export function storedUiLanguage(): UiLanguage | null {
  const stored = localStorage.getItem(UI_LANGUAGE_KEY)
  return isUiLanguage(stored) ? stored : null
}

function deviceUiLanguage(): UiLanguage {
  for (const candidate of navigator.languages ?? [navigator.language]) {
    const base = candidate?.slice(0, 2).toLowerCase()
    if (isUiLanguage(base)) return base
  }
  return "en"
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    de: { translation: de },
    it: { translation: it },
    pt: { translation: pt },
  },
  lng: storedUiLanguage() ?? deviceUiLanguage(),
  fallbackLng: "en",
  // React already escapes; double-escaping turns apostrophes into entities.
  interpolation: { escapeValue: false },
})

export function setUiLanguage(language: UiLanguage) {
  localStorage.setItem(UI_LANGUAGE_KEY, language)
  void i18n.changeLanguage(language)
  document.documentElement.lang = language
}

document.documentElement.lang = i18n.language

export default i18n
