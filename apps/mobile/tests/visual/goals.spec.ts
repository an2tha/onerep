import { expect, test } from "@playwright/test"

test("goal setup asks only for a focus and saves the whole-body view", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/goals.html")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByRole("button", { name: "Set a goal" }).first().click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "Your goal" })).toBeVisible()
  await expect(dialog.getByRole("radio")).toHaveCount(4)
  await expect(dialog.getByLabel("Lower bound")).toHaveCount(0)
  await expect(dialog.getByRole("button", { name: "Save goal" })).toBeDisabled()
  await dialog.getByRole("radio", { name: "Build muscle" }).check()
  await dialog.getByRole("button", { name: "Save goal" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole("region", { name: "Whole-body assessment" })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Your zone", exact: true })
  ).toBeVisible()
  await expect(page.getByText("In your zone")).toBeVisible()
  await expect(page.getByText("Training", { exact: true })).toBeVisible()
  await expect(page.getByText("Recovery (HRV)", { exact: true })).toBeVisible()
  await expect(
    page.getByRole("button", { name: "How this works" })
  ).toHaveAttribute("aria-expanded", "false")
  await page.screenshot({
    path: `test-results/goals-dashboard-${test.info().project.name}.png`,
    animations: "disabled",
    fullPage: true,
  })
  await page.getByRole("button", { name: "Edit goal" }).click()
  await page.getByRole("radio", { name: "Build endurance" }).check()
  await page.getByRole("button", { name: "Save goal" }).click()
  await expect(
    page.getByRole("heading", { name: "Build endurance" })
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
})

test("missing data has clear actions and does not show a made-up score", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/goals.html?mode=empty")
  await expect(page.getByLabel("Overall score unavailable")).toBeVisible()
  await expect(page.getByText("Build your baseline")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Log a workout" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Connect health" })
  ).toBeVisible()
  await expect(
    page.getByText("Training · Sleep · Recovery · Activity")
  ).toBeVisible()
  await page.screenshot({
    path: `test-results/goals-empty-${test.info().project.name}.png`,
    animations: "disabled",
    fullPage: true,
  })
})

test("recovery caution remains prominent and explanation opens by keyboard", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/goals.html?mode=poor")
  await expect(page.getByText("Ease back")).toBeVisible()
  await expect(page.getByText("Make the next session easier")).toBeVisible()
  const details = page.getByRole("button", { name: "How this works" })
  await details.focus()
  await page.keyboard.press("Enter")
  await expect(details).toHaveAttribute("aria-expanded", "true")
  await expect(page.getByText(/planning score from your logs/)).toBeVisible()
})

test("save errors retain the focus and allow retry", async ({ page }) => {
  await page.goto("/tests/visual/fixtures/goals.html?fail=1")
  await page.getByRole("button", { name: "Set a goal" }).first().click()
  await page.getByRole("radio", { name: "Lose fat" }).check()
  await page.getByRole("button", { name: "Save goal" }).click()
  await expect(page.getByRole("alert")).toContainText("Could not save")
  await expect(page.getByRole("radio", { name: "Lose fat" })).toBeChecked()
  await page.getByRole("button", { name: "Close goal setup" }).click()
  await page.getByLabel("Simulate saving failure").uncheck()
  await page.getByRole("button", { name: "Set a goal" }).first().click()
  await page.getByRole("radio", { name: "Lose fat" }).check()
  await page.getByRole("button", { name: "Save goal" }).click()
  await expect(page.getByRole("heading", { name: "Lose fat" })).toBeVisible()
})
