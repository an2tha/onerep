import { expect, test } from "@playwright/test"

test("sleep leads with duration and dated trends, with accessible details and plan editing", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/sleep.html")
  await expect(
    page.getByRole("heading", { name: "Your sleep", exact: true })
  ).toBeVisible()
  await expect(
    page.getByText("6h 30m of your 8h goal", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Sleep against your goal" })
  ).toBeVisible()
  await page.getByRole("button", { name: "28 days", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "28 days", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "7 days", exact: true }).click()
  await page.getByText("Measurements and calculation", { exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect(
    page.getByText("Duration goal progress", { exact: true })
  ).toBeVisible()
  await page.getByLabel("Main sleep duration goal").selectOption("510")
  await page.getByLabel("Planned bedtime (optional)").fill("22:45")
  await page.getByRole("button", { name: "Save sleep plan" }).click()
  await expect(page.getByRole("status")).toContainText("Sleep plan saved")
  await expect(
    page.getByText("6h 30m of your 8h goal", { exact: true })
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
})

test("missing nights and changed sources are explicit", async ({ page }) => {
  await page.goto("/tests/visual/fixtures/sleep.html?mode=missing")
  await expect(
    page.getByText("No sleep recorded for this night.")
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Sleep against your goal" })
  ).toBeVisible()
  await page.goto("/tests/visual/fixtures/sleep.html?mode=source")
  await expect(
    page.getByText(
      "Your sleep source changed. Your usual range uses readings from this source only."
    )
  ).toBeVisible()
  await page.goto("/tests/visual/fixtures/sleep.html?mode=empty")
  await expect(
    page.getByText("No sleep recorded for this night.")
  ).toBeVisible()
  await expect(page.getByText("Build a picture of your week.")).toBeVisible()
})

test("failed saves retain the draft and can be retried", async ({ page }) => {
  await page.goto("/tests/visual/fixtures/sleep.html?fail=1")
  await page.getByLabel("Main sleep duration goal").selectOption("540")
  await page.getByRole("button", { name: "Save sleep plan" }).click()
  await expect(page.getByRole("alert")).toContainText(
    "Your changes are still here"
  )
  await expect(page.getByLabel("Main sleep duration goal")).toHaveValue("540")
  await page.getByLabel("Simulate saving failure").uncheck()
  await page.getByRole("button", { name: "Save sleep plan" }).click()
  await expect(page.getByRole("status")).toContainText("saved")
})

test("Today summaries hide, reorder, persist and link to the check-in", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/sleep.html?surface=today")
  await page.getByRole("button", { name: "Customize summary" }).click()
  await page.getByLabel("Nutrition", { exact: true }).check()
  await page.getByRole("button", { name: "Move Nutrition up" }).click()
  await page.getByRole("button", { name: "Move Nutrition up" }).click()
  await page.getByRole("button", { name: "Save summary" }).click()
  await expect(page.locator("[data-insight]").first()).toHaveAttribute(
    "data-insight",
    "nutrition"
  )
  await page.getByRole("button", { name: "Customize summary" }).click()
  await page.getByLabel("Sleep", { exact: true }).uncheck()
  await page.getByRole("button", { name: "Save summary" }).click()
  await expect(page.locator('[data-insight="sleep"]')).toHaveCount(0)
  await page.getByRole("link", { name: "Open check-in" }).click()
  await expect(page.getByTestId("route")).toHaveText("/coach?panel=checkin")
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
})

test("historical nights give retrospective guidance and an explicit date range", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/sleep.html")
  await page.getByText("Explore individual nights", { exact: true }).click()
  await page.getByRole("button", { name: /Oct 24/ }).click()
  await expect(
    page.getByRole("heading", { name: "What this night suggests" })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Tonight’s focus" })
  ).toHaveCount(0)
  await expect(
    page.getByRole("link", { name: "Edit current sleep plan" })
  ).toBeVisible()
  await expect(
    page.getByText(/Seven-day period: Oct 18 to Oct 24/)
  ).toBeVisible()
})
