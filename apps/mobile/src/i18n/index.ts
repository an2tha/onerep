import { UI_LANGUAGE_KEY, i18n, type UiLanguage } from "@repo/ui/i18n"
import en from "./locales/en.json"
import es from "./locales/es.json"
import fr from "./locales/fr.json"
import de from "./locales/de.json"
import it from "./locales/it.json"
import pt from "./locales/pt.json"

export { UI_LANGUAGES, storedUiLanguage, type UiLanguage } from "@repo/ui/i18n"

for (const [language, messages] of Object.entries({ en, es, fr, de, it, pt })) {
  i18n.addResourceBundle(language, "translation", messages, true, true)
}

export function setUiLanguage(language: UiLanguage) {
  localStorage.setItem(UI_LANGUAGE_KEY, language)
  document.documentElement.lang = language
  void i18n.changeLanguage(language)
  // Recreate module-level option labels and native adapters in the selected language.
  // Language selection lives in Settings, outside editors and active sessions.
  window.location.reload()
}

if (typeof document !== "undefined")
  document.documentElement.lang = i18n.language

export default i18n
