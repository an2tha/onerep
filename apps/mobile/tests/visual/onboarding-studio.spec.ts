import { test, expect } from "@playwright/test"
const url = "/tests/visual/fixtures/onboarding.html"
for (const [stage, room] of [
  [0, "overview"],
  [6, "recovery"],
  [9, "nutrition"],
  [14, "planning"],
] as const) {
  test(`setup ${stage} in ${room}`, async ({ page }, info) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.route("**/api/auth/**", (route) => route.fulfill({ json: null }))
    await page.goto(`${url}?stage=${stage}`)
    await expect(page.locator("#setup-heading")).toBeVisible()
    await expect(page.locator(".studio-canvas")).toHaveAttribute(
      "data-ready",
      "true",
      { timeout: 60000 }
    )
    await expect(page.locator(".studio-canvas")).toHaveAttribute(
      "data-station",
      room
    )
    await expect(page.locator(".studio-canvas")).toHaveAttribute(
      "data-leds",
      "40"
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await expect(page.locator(".studio-canvas")).toHaveCSS("opacity", "1")
    expect(errors).toEqual([])
    await page.screenshot({
      path: `../../.impeccable/review/pavilion-${room}-${info.project.name}.png`,
    })
    await page.getByRole("button", { name: "Setup steps", exact: true }).click()
    await expect(
      page.getByRole("navigation", { name: "Setup steps" })
    ).toBeVisible()
    if (stage > 0) {
      await page
        .getByRole("navigation", { name: "Setup steps" })
        .getByRole("button")
        .first()
        .click()
      await expect(page.locator(".setup-page")).toHaveAttribute(
        "data-stage",
        "intro"
      )
      await expect(page.locator(".setup-sidebar")).toBeHidden()
    }
  })
}
test("setup remains usable without WebGL assets", async ({ page }) => {
  await page.route("**/*.glb", (route) => route.abort())
  await page.goto(url)
  await expect(page.locator(".onboarding-pavilion")).toHaveAttribute(
    "data-failed",
    "true",
    { timeout: 60000 }
  )
  await page.getByRole("button", { name: /let.s go/i }).click()
  await expect(page.locator(".setup-page")).toHaveAttribute(
    "data-stage",
    "preferences"
  )
  await expect(
    page.getByRole("button", { name: "Continue", exact: true })
  ).toBeEnabled()
})
test("review consent and final save survive the studio redesign", async ({
  page,
}) => {
  await page.goto(`${url}?stage=14`)
  const next = page.getByRole("button", { name: /What’s next/ })
  await next.click()
  await expect(page.getByRole("alert")).toContainText("confirm data consent")
  await page.getByRole("checkbox", { name: /I explicitly consent/ }).check()
  await next.click()
  await expect(page.locator(".setup-page")).toHaveAttribute(
    "data-stage",
    "next"
  )
  await page.getByRole("button", { name: /Open OneRep/ }).click()
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("users/onboarding:save"))
    )
    .not.toBeNull()
  const saved = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("users/onboarding:save")!)
  )
  expect(saved.consent.dataUse).toBe(true)
})
test("camera travel renders then leaves the GPU idle", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.addInitScript(() => {
    const state = window as unknown as { sceneDraws: number }
    state.sceneDraws = 0
    const original = WebGL2RenderingContext.prototype.drawElements
    WebGL2RenderingContext.prototype.drawElements = function (...args) {
      state.sceneDraws++
      return original.apply(this, args)
    }
  })
  await page.goto(`${url}?stage=9`)
  await expect(page.locator(".studio-canvas")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 60000 }
  )
  await page.getByRole("button", { name: "Back", exact: true }).click()
  await expect(page.locator(".studio-canvas")).toHaveAttribute(
    "data-station",
    "recovery"
  )
  // Damped travel must settle, after which no geometry should be submitted.
  await page.waitForTimeout(6500)
  const reads = () =>
    page.evaluate(
      () => (window as unknown as { sceneDraws: number }).sceneDraws
    )
  const settled = await reads()
  expect(settled).toBeGreaterThan(0)
  await page.waitForTimeout(500)
  expect(await reads()).toBe(settled)
})
for (const [stage, room] of [
  [0, "overview"],
  [6, "recovery"],
  [9, "nutrition"],
  [14, "planning"],
] as const) {
  test(`daylight ${room}`, async ({ page }, info) => {
    await page.goto(`${url}?stage=${stage}&appearance=light`)
    await expect(page.locator(".studio-canvas")).toHaveAttribute(
      "data-appearance",
      "light",
      { timeout: 60000 }
    )
    await expect(page.locator(".studio-canvas")).toHaveCSS("opacity", "1")
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await page.screenshot({
      path: `../../.impeccable/review/pavilion-${room}-light-${info.project.name}.png`,
    })
  })
}
test("appearance switches relight the same scene and follow the device", async ({
  page,
}, info) => {
  await page.goto(`${url}?stage=1`)
  const scene = page.locator(".studio-canvas")
  await expect(scene).toHaveAttribute("data-ready", "true")
  await page
    .locator("canvas")
    .evaluate((canvas) => (canvas.dataset.original = "true"))
  await page.getByRole("button", { name: "Light", exact: true }).click()
  await expect(scene).toHaveAttribute("data-appearance", "light")
  await expect(page.locator("canvas")).toHaveAttribute("data-original", "true")
  await expect(
    page.getByRole("button", { name: "Light", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(scene).toHaveCSS("opacity", "1")
  await page.screenshot({
    path: `../../.impeccable/review/pavilion-preferences-light-${info.project.name}.png`,
  })
  await page.getByRole("button", { name: "Match device", exact: true }).click()
  await page.emulateMedia({ colorScheme: "dark" })
  await expect(scene).toHaveAttribute("data-appearance", "dark")
  await page.emulateMedia({ colorScheme: "light" })
  await expect(scene).toHaveAttribute("data-appearance", "light")
})
test("changing flavour updates pavilion accent materials", async ({
  page,
}, info) => {
  await page.goto(`${url}?stage=1&appearance=light`)
  const scene = page.locator(".studio-canvas")
  await expect(scene).toHaveAttribute("data-ready", "true")
  const before = await scene.getAttribute("data-accent")
  await page.getByRole("button", { name: "Show Forest", exact: true }).click()
  await expect(scene).toHaveAttribute("data-identity", "forest")
  await expect.poll(() => scene.getAttribute("data-accent")).not.toBe(before)
  await expect(page.locator("html")).toHaveAttribute(
    "data-visual-identity",
    "forest"
  )
  await expect
    .poll(() =>
      page.getByRole("article", { name: "Forest flavour" }).evaluate((el) => {
        const rect = el.getBoundingClientRect()
        const viewport = el
          .closest(".flavour-carousel")!
          .getBoundingClientRect()
        return Math.abs(
          rect.x + rect.width / 2 - viewport.x - viewport.width / 2
        )
      })
    )
    .toBeLessThan(2)
  await expect(scene).toHaveCSS("opacity", "1")
  await page.locator("#setup-content").evaluate((el) => el.scrollTo(0, 0))
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: `../../.impeccable/review/pavilion-forest-${info.project.name}.png`,
  })
})
