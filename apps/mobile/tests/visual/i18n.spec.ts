import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"

const languages = ["en", "de", "es", "fr", "it", "pt"] as const
const messages = (language: string): Record<string, string> =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../../../packages/ui/src/locales/${language}.json`,
        import.meta.url
      ),
      "utf8"
    )
  )
const fixture = (language: string, surface: string) =>
  `/tests/visual/fixtures/i18n.html?lang=${language}&surface=${surface}`

for (const language of languages) {
  test(`${language}: preferences preserve stored values and fit the viewport`, async ({
    page,
  }) => {
    const copy = messages(language)
    await page.goto(fixture(language, "preferences"))
    await expect(
      page.getByRole("heading", { name: copy.Settings, exact: true })
    ).toBeVisible()
    await page.getByRole("button", { name: copy.Pounds, exact: true }).click()
    await expect(page.getByTestId("saved-weight-unit")).toHaveText("lbs")
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1)
    ).toBe(true)
  })

  test(`${language}: native AI limit notice has no upgrade offer`, async ({
    page,
  }) => {
    const copy = messages(language)
    await page.goto(fixture(language, "billing"))
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole("heading", { name: copy["Monthly AI allowance"] })
    ).toBeVisible()
    await expect(dialog).not.toContainText("4,99")
    await expect(
      dialog.getByRole("button", { name: copy["Subscribe with Apple"] })
    ).toHaveCount(0)
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1)
    ).toBe(true)
    const bounds = await dialog.boundingBox()
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    await dialog
      .getByRole("button", { name: copy["Got it"], exact: true })
      .click()
    await expect(dialog).toHaveCount(0)
  })

  test(`${language}: calendar uses the app locale`, async ({ page }) => {
    await page.goto(fixture(language, "calendar"))
    const month = new Intl.DateTimeFormat(language, { month: "long" }).format(
      new Date(2026, 8, 24)
    )
    await expect(page.locator('[data-slot="calendar"]')).toContainText(
      new RegExp(month, "i")
    )
  })
}

test("changing language reloads into the persisted language", async ({
  page,
}) => {
  await page.goto(fixture("de", "preferences"))
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("combobox", { name: "Sprache" }).selectOption("fr"),
  ])
  await expect(
    page.getByRole("heading", { name: messages("fr").Settings, exact: true })
  ).toBeVisible()
  await expect(page.locator("html")).toHaveAttribute("lang", "fr")
  expect(
    await page.evaluate(() => localStorage.getItem("onerep:ui-language"))
  ).toBe("fr")
})
