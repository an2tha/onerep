import { test, expect } from "@playwright/test"
const url = "/tests/visual/fixtures/onboarding.html"
test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/**", (route) => route.fulfill({ json: null }))
})
for (const [stage, name] of [
  [2, "goal"],
  [3, "experience"],
  [5, "sex"],
  [6, "measurements"],
  [7, "activity"],
  [8, "safety"],
  [14, "review"],
  [16, "programmes"],
  [17, "programmeTrack"],
] as const) {
  test(`starry question ${name}`, async ({ page }, info) => {
    const errors: string[] = []
    const sceneAssets: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("request", (request) => {
      if (/\.(glb|hdr)(\?|$)/.test(request.url()))
        sceneAssets.push(request.url())
    })
    await page.goto(`${url}?stage=${stage}`)
    await expect(page.locator("#setup-heading")).toBeVisible()
    await expect(page.locator(".setup-page")).toHaveAttribute(
      "data-stage",
      name
    )
    await expect(page.locator(".setup-starry-backdrop")).toBeVisible()
    await expect(page.locator(".setup-page")).toHaveCSS("opacity", "1")
    await expect(page.locator("canvas")).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    expect(sceneAssets).toEqual([])
    expect(errors).toEqual([])
    await page.screenshot({
      path: `../../.impeccable/review/starry-${name}-${info.project.name}.png`,
      fullPage: true,
    })
    await page.getByRole("button", { name: "Setup steps", exact: true }).click()
    await expect(
      page.getByRole("navigation", { name: "Setup steps" })
    ).toBeVisible()
    await page
      .getByRole("navigation", { name: "Setup steps" })
      .getByRole("button")
      .first()
      .click()
    await expect(page.locator(".galaxy-welcome")).toBeVisible()
  })
}
test("setup remains usable without WebGL assets", async ({ page }) => {
  await page.route("**/onboarding-galaxy/deep-space.webp", (route) =>
    route.abort()
  )
  await page.goto(url)
  await expect(page.locator(".galaxy-scene")).toHaveAttribute(
    "data-failed",
    "true",
    { timeout: 60000 }
  )
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(page.locator(".setup-page")).toHaveAttribute(
    "data-stage",
    "goal"
  )
  await expect(
    page.getByRole("button", { name: "Lose fat", exact: false })
  ).toBeEnabled()
})
test("review consent and final save survive the studio redesign", async ({
  page,
}) => {
  await page.goto(`${url}?stage=14`)
  const next = page.getByRole("button", { name: /Open OneRep/ })
  await next.click()
  await expect(page.getByRole("alert")).toContainText("confirm data consent")
  await page.getByRole("checkbox", { name: /I explicitly consent/ }).check()
  await next.click()
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
for (const stage of [2, 6, 14]) {
  test(`starry contrast with light app theme at ${stage}`, async ({ page }) => {
    await page.goto(`${url}?stage=${stage}&appearance=light`)
    await expect(page.locator(".starry-onboarding")).toHaveCSS(
      "color",
      "rgb(237, 241, 248)"
    )
    await expect(page.locator("canvas")).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
  })
}

test("quiet choices advance and measurements remain editable", async ({
  page,
}) => {
  await page.goto(`${url}?stage=2`)
  await page.getByRole("button", { name: "Lose fat", exact: false }).click()
  await expect(page.locator(".setup-page")).toHaveAttribute(
    "data-stage",
    "experience"
  )
  await page.getByRole("button", { name: "New to this", exact: false }).click()
  await page.getByRole("button", { name: "Female", exact: true }).click()
  await expect(page.locator(".starry-onboarding")).toHaveAttribute(
    "data-motion",
    "idle"
  )
  const age = page.getByRole("textbox", { name: "Age", exact: true })
  await age.fill("1")
  await age.blur()
  await expect(page.getByRole("alert")).toContainText("Enter a number")
  await expect(
    page.getByRole("button", { name: "Confirm measurements" })
  ).toBeDisabled()
  await age.fill("29")
  await age.blur()
  await page.getByRole("button", { name: "Confirm measurements" }).click()
  await expect(page.locator(".setup-page")).toHaveAttribute(
    "data-stage",
    "activity"
  )
})
test("goals come before optional customization", async ({ page }) => {
  await page.goto(url)
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(page.locator(".setup-page")).toHaveAttribute(
    "data-stage",
    "goal"
  )
  await expect(
    page.getByRole("button", { name: "Light", exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Show Forest", exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByRole("progressbar", { name: "Profile setup progress" })
  ).toHaveAttribute("aria-valuemax", "10")
})

test("galaxy greeting respects reduced motion and continues immediately", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(url)
  await expect(
    page.getByRole("heading", {
      name: "Hi, let's customize your experience",
      exact: true,
    })
  ).toBeVisible()
  await expect(page.locator(".galaxy-welcome")).toHaveAttribute(
    "data-typing",
    "false"
  )
  await expect(page.getByRole("slider")).toHaveCount(0)
  await expect(page.locator(".galaxy-canvas")).toHaveAttribute(
    "data-ready",
    "true"
  )
  await expect(page.locator(".galaxy-canvas")).toHaveAttribute(
    "data-speed",
    "0.00"
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: `../../.impeccable/review/galaxy-${info.project.name}.png`,
  })
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(page.locator(".setup-page")).toHaveAttribute(
    "data-stage",
    "goal"
  )
})

test("live galaxy accelerates, decelerates, zooms, pans and pauses", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(url)
  const canvas = page.locator(".galaxy-canvas")
  await expect(canvas).toHaveAttribute("data-ready", "true")
  await expect(page.locator(".galaxy-welcome")).toHaveAttribute(
    "data-typing",
    "false"
  )
  await page.mouse.move(180, 220)
  await page.mouse.down()
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-speed")))
    .toBeGreaterThan(40)
  await page.mouse.up()
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-speed")), {
      timeout: 10000,
    })
    .toBeLessThan(6.4)
  await page.mouse.wheel(0, -250)
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-zoom")))
    .toBeCloseTo(1.25, 1)
  await page.mouse.wheel(0, 250)
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-zoom")))
    .toBeCloseTo(1, 1)
  await page.mouse.move(180, 220)
  await page.mouse.down()
  await page.mouse.move(280, 280, { steps: 8 })
  await page.mouse.up()
  await expect
    .poll(async () =>
      Number((await canvas.getAttribute("data-look"))!.split(",")[0])
    )
    .toBeLessThan(-5)
  await page.getByRole("button", { name: "Pause animation" }).click()
  await expect(
    page.getByRole("button", { name: "Resume animation" })
  ).toBeVisible()
  await expect(canvas).toHaveAttribute("data-speed", "0.00")
  await page.getByRole("button", { name: "Resume animation" }).click()
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-speed")))
    .toBeGreaterThan(6)
  await expect(page.locator(".galaxy-welcome")).toHaveAttribute(
    "data-typing",
    "false"
  )
  expect(errors).toEqual([])
})

test("deliberate transition pans the stars and locks out repeat choices", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto(`${url}?stage=2`)
  const shell = page.locator(".starry-onboarding")
  const backdrop = page.locator(".setup-starry-backdrop")
  const before = await backdrop.evaluate(
    (element) => getComputedStyle(element).transform
  )
  const option = page.getByRole("button", { name: "Lose fat", exact: false })
  const bounds = await option.boundingBox()
  await option.click()
  await expect(shell).toHaveAttribute("data-motion", "leaving")
  await expect(page.locator(".setup-page")).toHaveAttribute(
    "data-stage",
    "goal"
  )
  await page.mouse.click(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2
  )
  await expect(page.locator(".setup-page")).toHaveAttribute(
    "data-stage",
    "experience"
  )
  await expect(shell).toHaveAttribute("data-motion", "idle")
  await expect(page.locator("#setup-heading")).toBeFocused()
  await expect
    .poll(async () =>
      backdrop.evaluate((element) => getComputedStyle(element).transform)
    )
    .not.toBe(before)
  await expect(page.locator("canvas")).toHaveCount(0)
})

test("swipes navigate valid questions without bypassing validation or saving", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto(`${url}?stage=6`)
  const shell = page.locator(".starry-onboarding")
  const age = page.getByRole("textbox", { name: "Age", exact: true })
  const swipe = async (direction: "left" | "right") => {
    const width = page.viewportSize()!.width
    const from = direction === "left" ? width * 0.8 : width * 0.2
    const to = direction === "left" ? width * 0.2 : width * 0.8
    await page.mouse.move(from, 245)
    await page.mouse.down()
    await page.mouse.move(to, 245, { steps: 10 })
    await page.mouse.up()
  }
  await age.fill("1")
  await age.blur()
  await swipe("left")
  await expect(page.locator(".setup-page")).toHaveAttribute(
    "data-stage",
    "measurements"
  )
  await expect(shell).toHaveAttribute("data-motion", "idle")
  await age.fill("29")
  await age.blur()
  await swipe("left")
  await expect(page.locator(".setup-page")).toHaveAttribute(
    "data-stage",
    "activity"
  )
  await expect(shell).toHaveAttribute("data-motion", "idle")
  await swipe("right")
  await expect(shell).toHaveAttribute("data-direction", "back")
  await expect(page.locator(".setup-page")).toHaveAttribute(
    "data-stage",
    "measurements"
  )
  await expect(shell).toHaveAttribute("data-motion", "idle")
  await expect(age).toHaveValue("29")
  await page.goto(`${url}?stage=14`)
  await swipe("left")
  await expect(page.locator(".setup-page")).toHaveAttribute(
    "data-stage",
    "review"
  )
  expect(
    await page.evaluate(() => sessionStorage.getItem("users/onboarding:save"))
  ).toBeNull()
})

test("reduced motion skips question travel and background pan", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(`${url}?stage=2`)
  await page.getByRole("button", { name: "Lose fat", exact: false }).click()
  await expect(page.locator(".setup-page")).toHaveAttribute(
    "data-stage",
    "experience"
  )
  await expect(page.locator(".starry-onboarding")).toHaveAttribute(
    "data-motion",
    "idle"
  )
  await expect(page.locator(".setup-starry-backdrop")).toHaveCSS(
    "transform",
    "none"
  )
  await expect(page.locator(".setup-page")).toHaveCSS("animation-name", "none")
})

test("onboarding offers guided nutrition and training before the final save", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(`${url}?stage=16`)
  await page
    .getByRole("button", { name: "Start a guided programme", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "What would you like help with?" })
  ).toBeVisible()
  await expect(
    page.getByText("AI generation uses 5 tokens per programme", {
      exact: false,
    })
  ).toBeVisible()
  await page.getByRole("button", { name: "Both", exact: true }).click()
  await page.getByRole("checkbox", { name: /I explicitly consent/ }).check()
  await page
    .getByRole("button", { name: "Set up my programme", exact: false })
    .click()
  await expect(page.getByTestId("destination")).toHaveText(
    "/programmes?setup=1&track=both&mode=guided"
  )
})

test("explore first skips programme questions and can be changed before saving", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(`${url}?stage=16`)
  await page.getByRole("button", { name: "Explore first", exact: true }).click()
  await expect(page.locator(".setup-page")).toHaveAttribute(
    "data-stage",
    "review"
  )
  await page.getByRole("button", { name: "Back", exact: true }).click()
  await expect(page.locator(".setup-page")).toHaveAttribute(
    "data-stage",
    "programmes"
  )
  await page
    .getByRole("button", { name: "Create my own programme", exact: true })
    .click()
  await expect(
    page.getByText("Creating your own programme is free.", { exact: false })
  ).toBeVisible()
  await page.getByRole("button", { name: "Training", exact: true }).click()
  await page.getByRole("checkbox", { name: /I explicitly consent/ }).check()
  await page
    .getByRole("button", { name: "Set up my programme", exact: false })
    .click()
  await expect(page.getByTestId("destination")).toHaveText(
    "/programmes?setup=1&track=training&mode=manual"
  )
})
