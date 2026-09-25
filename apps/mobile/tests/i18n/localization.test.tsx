import { afterEach, describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  i18n,
  Message,
  messageVariant,
  storedUiLanguage,
  tr,
  translateError,
  uiLocale,
  speechLocale,
} from "@repo/ui/i18n"
import { WEEK_DAYS } from "../../src/lib/workout-sync"
import { dateKeyToDay } from "../../src/dashboard/helpers"
import { billingPeriodLabel } from "../../src/lib/billing-period"
import { englishSource } from "../helpers/localized-source"

afterEach(async () => {
  await i18n.changeLanguage("en")
})

describe("app localization", () => {
  test("the purchase and restore actions have reviewed labels in every language", async () => {
    const labels = {
      en: "Restore purchases",
      de: "Käufe wiederherstellen",
      es: "Restaurar compras",
      fr: "Restaurer les achats",
      it: "Ripristina acquisti",
      pt: "Restaurar compras",
    }
    for (const [language, label] of Object.entries(labels)) {
      await i18n.changeLanguage(language)
      expect(tr("Restore purchases")).toBe(label)
      expect(uiLocale()).toBe(language)
    }
  })

  test("plural messages are translated as complete sentences", async () => {
    await i18n.changeLanguage("de")
    const source = "{{value0}} exercise{{value1}}"
    expect(tr(source, { value0: 1, value1: "" })).toBe("1 Übung")
    expect(tr(source, { value0: 3, value1: "s" })).toBe("3 Übungen")
    expect(messageVariant(source, { value0: 3, value1: "s" })).toBe(
      "{{value0}} exercises"
    )
  })

  test("rich messages reorder controls, preserve user content, and escape HTML", async () => {
    await i18n.changeLanguage("de")
    const source = "Test before {{value0}} after {{value1}}"
    i18n.addResource("de", "app", source, "Nach {{value1}} vor {{value0}}")
    const markup = renderToStaticMarkup(
      <Message
        text={source}
        values={{
          value0: <a href="/settings">Settings</a>,
          value1: '<script>alert("test")</script>',
        }}
      />
    )
    expect(markup).toContain("Nach &lt;script&gt;")
    expect(markup).toContain('<a href="/settings">Settings</a>')
    expect(markup).not.toContain("<script>")
    expect(markup.indexOf("&lt;script&gt;")).toBeLessThan(
      markup.indexOf("<a href=")
    )
  })

  test("empty optional details retain the translated complete message", async () => {
    await i18n.changeLanguage("de")
    const source = "Optional details{{value0}}"
    i18n.addResource("de", "app", source, "Zusätzliche Angaben{{value0}}")
    expect(tr(source, { value0: "" })).toBe("Zusätzliche Angaben")
    expect(speechLocale()).toBe("de-DE")
    await i18n.changeLanguage("pt")
    expect(speechLocale()).toBe("pt-PT")
  })

  test("native subscription periods follow the app language", async () => {
    await i18n.changeLanguage("de")
    expect(billingPeriodLabel("month")).toBe("Monat")
    expect(billingPeriodLabel("3 months")).toBe("3 Monate")
    await i18n.changeLanguage("pt")
    expect(billingPeriodLabel("month")).toBe("mês")
    expect(billingPeriodLabel("provider-specific label")).toBe(
      "provider-specific label"
    )
  })

  test("stored language validation tolerates blocked and corrupt storage", () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage"
    )
    try {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: { getItem: () => "invalid" },
      })
      expect(storedUiLanguage()).toBeNull()
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        get: () => {
          throw new Error("denied")
        },
      })
      expect(storedUiLanguage()).toBeNull()
    } finally {
      if (descriptor)
        Object.defineProperty(globalThis, "localStorage", descriptor)
      else Reflect.deleteProperty(globalThis, "localStorage")
    }
  })

  test("localized interfaces retain canonical schedule keys", async () => {
    await i18n.changeLanguage("de")
    expect(WEEK_DAYS).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    expect(dateKeyToDay("2026-09-24", "Europe/Berlin")).toBe("Thu")
    expect(new Intl.NumberFormat(uiLocale()).format(1234.5)).toBe("1.234,5")
  })

  test("unknown error diagnostics and user-authored text remain intact", async () => {
    await i18n.changeLanguage("de")
    expect(translateError("Unrecognized provider diagnostic 123")).toBe(
      "Unrecognized provider diagnostic 123"
    )
    expect(tr("Log {{value0}}", { value0: "My lunch <3" })).toContain(
      "My lunch <3"
    )
  })
})

test("source contracts preserve the meaning of translated attributes and templates", () => {
  expect(
    englishSource(
      '<button aria-label={tr("Log {{value0}}", {value0: food.name})}>{tr("Log")}</button>'
    )
  ).toBe("<button aria-label={`Log ${food.name}`}>Log</button>")
  expect(
    englishSource('const state = "pending"; const label = tr("Pending")')
  ).toBe('const state = "pending"; const label = "Pending"')
})
