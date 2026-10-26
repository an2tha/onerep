import { expect, test } from "@playwright/test"

test("Today summary and timeline remain reachable on phones", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/tests/visual/fixtures/sleep.html?surface=dashboard")
  await page.getByRole("button", { name: "Customize summary" }).click()
  await page.getByLabel("Training", { exact: true }).check()
  await page.getByRole("button", { name: "Save summary" }).click()
  await expect(page.getByRole("status")).toContainText("saved")
  const timeline = page.getByRole("region", { name: "Day timeline", exact: true })
  await timeline.scrollIntoViewIfNeeded()
  await expect(timeline).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 1280, height: 720 },
  { width: 1024, height: 600 },
]) {
  test(`Today keeps the day wheel and week controls in view at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto("/tests/visual/fixtures/sleep.html?surface=dashboard")
    const timeline = page.getByRole("region", {
      name: "Day timeline",
      exact: true,
    })
    const week = page.locator(".dashboard-week-strip")
    const fits = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight + 1 &&
          document.documentElement.scrollWidth <= innerWidth
      )
    await expect(timeline).toBeVisible()
    await expect.poll(fits).toBe(true)
    await expect(week).toBeInViewport({ ratio: 1 })
    await expect
      .poll(() => timeline.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0)
    const start = await timeline.evaluate((el) => el.scrollTop)
    await timeline.hover({ position: { x: 20, y: 20 } })
    await page.mouse.wheel(0, -600)
    await expect
      .poll(() => timeline.evaluate((el) => el.scrollTop))
      .toBeLessThan(start - 100)
    await expect(week).toBeInViewport({ ratio: 1 })
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)

    await page.getByRole("button", { name: "Customize summary" }).click()
    for (const name of ["Training", "Nutrition", "Check-in"])
      await page.getByLabel(name, { exact: true }).check()
    await page.getByRole("button", { name: "Save summary" }).click()
    await expect(page.getByRole("status")).toContainText("saved")
    const context = page.locator(".dashboard-context")
    await expect
      .poll(() => context.evaluate((el) => el.scrollHeight > el.clientHeight))
      .toBe(true)
    await expect.poll(fits).toBe(true)
    await page
      .getByRole("button", { name: "Add a glass of water" })
      .scrollIntoViewIfNeeded()
    await expect(
      page.getByRole("button", { name: "Add a glass of water" })
    ).toBeInViewport()
    await expect(week).toBeInViewport({ ratio: 1 })
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)

    await timeline.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await timeline.hover({ position: { x: 20, y: 20 } })
    await page.mouse.wheel(0, 800)
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
    await expect(week).toBeInViewport({ ratio: 1 })
    await page.screenshot({
      path: `/tmp/onerep-today-scroll-${viewport.width}.png`,
    })
  })
}
