import { expect, test } from "@playwright/test"
const url = "/tests/visual/fixtures/programmes.html"
test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/**", (route) => route.fulfill({ json: null }))
  await page.emulateMedia({ reducedMotion: "reduce" })
})
for (const view of ["hub", "empty", "nutrition", "training", "draft"]) {
  test(`programme ${view} renders without overflow`, async ({ page }, info) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto(`${url}?view=${view}`)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    expect(errors).toEqual([])
    await page.screenshot({
      path: `../../.impeccable/review/programmes-${view}-${info.project.name}.png`,
      fullPage: true,
    })
  })
}
test("training shows the current block and starts a live workout", async ({
  page,
}) => {
  await page.goto(`${url}?view=training`)
  await expect(
    page.getByRole("heading", { name: "Full body A", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Lighter full body", exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole("combobox", { name: "View training block", exact: true })
    .selectOption("lighter")
  await expect(
    page.getByRole("heading", { name: "Lighter full body", exact: true }),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Start workout", exact: false })
    .click()
  await expect(page.getByTestId("destination")).toHaveText(
    "/workout/active/preset-2",
  )
})
test("nutrition portions are editable and a meal logs once", async ({
  page,
}) => {
  await page.goto(`${url}?view=nutrition`)
  await page
    .getByRole("button", { name: "Log this meal today", exact: false })
    .click()
  await expect(
    page.getByRole("button", { name: "Logged today", exact: false }),
  ).toBeDisabled()
  await page
    .getByRole("button", { name: "Manage programme", exact: true })
    .click()
  await page
    .getByRole("button", { name: "Edit upcoming plan", exact: true })
    .click()
  await page
    .getByRole("spinbutton", { name: "Servings", exact: true })
    .fill("1.5")
  await page.getByRole("button", { name: "Save changes", exact: true }).click()
  await expect(page.getByText("1.5 servings", { exact: false })).toBeVisible()
  await page.getByRole("button", { name: "Pause", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible()
})
test("programme activation and ending each require a clear final action", async ({
  page,
}) => {
  await page.goto(`${url}?view=draft`)
  await page
    .getByRole("button", { name: "Start programme", exact: false })
    .click()
  await expect(
    page.getByRole("region", { name: "Confirm programme change" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Start today", exact: true }).click()
  await page.getByRole("button", { name: "End programme", exact: true }).click()
  await page
    .getByRole("region", { name: "Confirm programme change" })
    .getByRole("button", { name: "End programme", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Edit upcoming plan", exact: true }),
  ).toHaveCount(0)
})

test("a partial bundle failure retries only the remaining five-token programme", async ({
  page,
}) => {
  await page.goto(`${url}?view=generation`)
  await page
    .getByRole("button", { name: "Generate · 10 AI tokens", exact: false })
    .click()
  await expect(page.getByRole("alert")).toContainText(
    "Workout generation failed",
  )
  await page
    .getByRole("button", { name: "Generate · 5 AI tokens", exact: false })
    .click()
  await expect(page.getByTestId("destination")).toHaveText(
    "/programmes?programme=draft-nutrition",
  )
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("programme-generation-attempts")!),
    ),
  ).toEqual({ nutrition: 1, training: 2 })
})

test("quiet hub expands with the keyboard and transitions into a programme", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto(`${url}?view=hub`)
  const nutrition = page.getByRole("button", {
    name: /Nutrition Food for your week/,
  })
  await expect(nutrition).toHaveAttribute("aria-expanded", "false")
  await expect(
    page.getByRole("button", { name: "Open programme" }),
  ).toHaveCount(0)
  await nutrition.focus()
  await nutrition.press("Enter")
  await expect(nutrition).toHaveAttribute("aria-expanded", "true")
  await expect(
    page.getByRole("button", { name: "Open programme" }),
  ).toBeVisible()
  await nutrition.press("Space")
  await expect(nutrition).toHaveAttribute("aria-expanded", "false")
  await nutrition.press("Enter")
  await page.getByRole("button", { name: "Open programme" }).click()
  await expect(
    page.getByRole("heading", { name: "Food for your week", exact: true }),
  ).toBeVisible()
  await expect(page.locator("main")).toHaveAttribute("data-view", "detail")
  await expect
    .poll(() =>
      page
        .locator(".programmes-stars i")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    )
    .toBe("programme-star-arrive")
  await page.getByRole("button", { name: "Recipes · 1" }).click()
  await expect(
    page.getByRole("button", { name: "Berry overnight oats", exact: true }),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Berry overnight oats", exact: true })
    .click()
  await expect(
    page.getByText("Mix oats with water and chill overnight.", { exact: true }),
  ).toBeVisible()
})

test("reduced motion suppresses star animation", async ({ page }) => {
  await page.goto(`${url}?view=hub`)
  expect(
    await page
      .locator(".programmes-stars")
      .first()
      .evaluate((el) => getComputedStyle(el).display),
  ).toBe("none")
})

test("review edits the saved nutrition profile inline and restores generation eligibility", async ({
  page,
}, info) => {
  await page.goto(`${url}?view=profile`)
  const generate = page.getByRole("button", {
    name: "Generate · 10 AI tokens",
    exact: false,
  })
  await expect(generate).toBeDisabled()
  await page
    .getByRole("button", { name: "Edit nutrition profile", exact: true })
    .click()
  const profile = page.getByRole("region", {
    name: "Nutrition profile",
    exact: true,
  })
  await expect(
    profile.getByRole("spinbutton", { name: "Age", exact: true }),
  ).toHaveValue("30")
  await profile
    .getByRole("combobox", { name: "Nutrition guidance", exact: true })
    .selectOption("standard")
  await profile
    .getByRole("textbox", { name: "Dietary preferences", exact: true })
    .fill("Vegetarian")
  await page.screenshot({
    path: `../../.impeccable/review/programme-profile-${info.project.name}.png`,
    fullPage: true,
  })
  await profile
    .getByRole("button", { name: "Save nutrition profile", exact: true })
    .click()
  await expect(profile).toHaveCount(0)
  await expect(generate).toBeEnabled()
  const saved = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("saved-nutrition-profile")!),
  )
  expect(saved).toMatchObject({
    age: 30,
    safetyMode: "standard",
    dietType: "Vegetarian",
  })
  const draft = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("onerep:programme-setup:v1:guest")!),
  )
  expect(draft.settings.diet).toBe("Vegetarian")
  await page
    .getByRole("button", { name: "Edit nutrition profile", exact: true })
    .click()
  await profile.getByRole("spinbutton", { name: "Age", exact: true }).fill("31")
  await profile.getByRole("button", { name: "Cancel", exact: true }).click()
  await page
    .getByRole("button", { name: "Edit nutrition profile", exact: true })
    .click()
  await expect(
    profile.getByRole("spinbutton", { name: "Age", exact: true }),
  ).toHaveValue("30")
})
