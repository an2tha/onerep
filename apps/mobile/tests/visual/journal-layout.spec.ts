import { expect, test } from "@playwright/test"

test.describe("journal layout regression", () => {
  test.skip(
    !process.env.JOURNAL_LAYOUT_FIXTURE,
    "Generate the journal layout fixture before running this check."
  )
  test("content stays in document flow and background reaches the status area", async ({
    page,
  }) => {
    await page.goto("/tests/visual/fixtures/journal.generated.html")
    await page.waitForFunction(
      () => document.documentElement.dataset.stylesReady === "true"
    )
    await page.evaluate(() => {
      document.documentElement.classList.toggle(
        "dark",
        matchMedia("(prefers-color-scheme: dark)").matches
      )
    })
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect()
        return {
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        }
      }
      const icons = [...document.querySelectorAll(".journal-glyph")].map(
        (icon) => getComputedStyle(icon).color
      )
      return {
        page: box(".journal-page"),
        backdrop: box(".journal-hero-wash"),
        heading: box(".journal-heading"),
        navigation: box(".journal-date-navigation"),
        week: box(".journal-week"),
        body: box(".journal-body"),
        overflow: document.documentElement.scrollWidth > innerWidth,
        icons,
      }
    })
    expect(geometry.heading.bottom).toBeLessThanOrEqual(geometry.navigation.top)
    expect(geometry.navigation.bottom).toBeLessThanOrEqual(geometry.week.top)
    expect(geometry.week.bottom).toBeLessThanOrEqual(geometry.body.top)
    expect(geometry.week.height).toBeLessThan(160)
    expect(geometry.overflow).toBe(false)
    expect(new Set(geometry.icons).size).toBe(1)
    if (page.viewportSize()!.width < 768)
      expect(geometry.backdrop.top).toBe(geometry.page.top)
    await expect(
      page.getByText("MORE THAN NUMBERS", { exact: true })
    ).toHaveCount(0)
    await page.screenshot({
      path: `test-results/journal-layout-${test.info().project.name}.png`,
      fullPage: true,
    })
  })
  test("history content fits narrow screens and distinguishes missing readings", async ({
    page,
  }) => {
    await page.goto("/tests/visual/fixtures/journal-history.generated.html")
    await page.waitForFunction(
      () => document.documentElement.dataset.stylesReady === "true"
    )
    await page.evaluate(() =>
      document.documentElement.classList.toggle(
        "dark",
        matchMedia("(prefers-color-scheme: dark)").matches
      )
    )
    await expect(page.locator(".journal-history-rows button")).toHaveCount(7)
    await expect(page.getByText("4 h", { exact: true })).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth
      )
    ).toBe(false)
    await page.screenshot({
      path: `test-results/journal-history-${test.info().project.name}.png`,
      fullPage: true,
    })
  })
  test("swipe panels fit the phone viewport", async ({ page }) => {
    test.skip(page.viewportSize()!.width >= 768)
    for (const index of [1, 2]) {
      await page.goto("/tests/visual/fixtures/journal.generated.html")
      await page.waitForFunction(
        () => document.documentElement.dataset.stylesReady === "true"
      )
      await page.evaluate(() =>
        document.documentElement.classList.toggle(
          "dark",
          matchMedia("(prefers-color-scheme: dark)").matches
        )
      )
      await page.evaluate((next) => {
        const body = document.querySelector<HTMLElement>(".journal-body")!
        const panel = document.querySelector<HTMLElement>(`#journal-panel-${next}`)!
        body.dataset.carouselReady = "true"
        body.style.setProperty("--journal-active-height", `${panel.scrollHeight}px`)
        body.scrollLeft = next * body.clientWidth
        document.querySelectorAll(".journal-section-nav button").forEach((button, i) =>
          button.setAttribute("aria-pressed", String(i === next))
        )
      }, index)
      await page.waitForTimeout(350)
      const geometry = await page.evaluate((next) => {
        const panel = document.querySelector<HTMLElement>(`#journal-panel-${next}`)!
        return {
          left: panel.getBoundingClientRect().left,
          right: panel.getBoundingClientRect().right,
          overflow: document.documentElement.scrollWidth > innerWidth,
        }
      }, index)
      expect(geometry.left).toBeGreaterThanOrEqual(-1)
      expect(geometry.right).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
      expect(geometry.overflow).toBe(false)
      await page.screenshot({
        path: `test-results/journal-panel-${index}-${test.info().project.name}.png`,
      })
    }
  })
})
