import { expect, test } from "@playwright/test"

test("first visit guides, validates, saves and allows editing", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/goals.html")
  const dialog = page.getByRole("dialog")
  await expect(
    dialog.getByRole("heading", { name: "Welcome to Goals." })
  ).toBeVisible()
  await expect(dialog).toHaveAttribute("aria-modal", "true")
  await page.screenshot({
    animations: "disabled",
    path: `test-results/goals-welcome-${test.info().project.name}.png`,
  })
  await dialog.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(
    dialog.getByRole("heading", { name: "Training and recovery together" })
  ).toBeVisible()
  await dialog.getByRole("button", { name: "Continue", exact: true }).click()
  await dialog.getByRole("button", { name: "Continue", exact: true }).click()
  await dialog.getByLabel("Lower bound").fill("15")
  await dialog.getByRole("button", { name: "Save goal" }).click()
  await expect(dialog.getByRole("alert")).toContainText("upper bound above")
  await dialog.getByLabel("Lower bound").fill("8")
  await dialog.getByRole("button", { name: "Save goal" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole("region", { name: "Whole-body assessment" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "All muscle groups · 15" })
  ).toBeVisible()
  await page.screenshot({
    animations: "disabled",
    path: `test-results/goals-dashboard-${test.info().project.name}.png`,
    fullPage: true,
  })
  await page.getByRole("button", { name: "Edit goal" }).click()
  await page.getByRole("radio", { name: /Build endurance/ }).check()
  await page.getByRole("button", { name: "Save goal" }).click()
  await expect(
    page.getByRole("heading", { name: "Training support", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("img", { name: /direct sets logged/ })
  ).toHaveCount(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
})

test("skip, replay, keyboard dismissal, save failure and retry", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/goals.html")
  await page.getByRole("button", { name: "Skip for now" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByLabel("Simulate saving failure").check()
  await page
    .getByRole("button", { name: "Replay the Goals introduction" })
    .click()
  await page.getByRole("button", { name: "Skip for now" }).click()
  await expect(page.getByRole("alert")).toContainText("could not be saved")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Replay the Goals introduction" })
  ).toBeFocused()
  await page.getByLabel("Simulate saving failure").uncheck()
  await page
    .getByRole("button", { name: "Replay the Goals introduction" })
    .click()
  await page.getByRole("button", { name: "Skip for now" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByText("How many sets?", { exact: true }).click()
  await expect(page.getByRole("link", { name: /Pelland/ })).toBeVisible()
})

test("handbook expands and collapses with keyboard and respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/tests/visual/fixtures/goals.html")
  await page.getByRole("button", { name: "Skip for now" }).click()
  const trigger = page.getByRole("button", {
    name: "How many sets?",
    exact: true,
  })
  const region = page.getByRole("region", {
    name: "How many sets?",
    exact: true,
    includeHidden: true,
  })
  await expect(trigger).toHaveAttribute("aria-expanded", "false")
  await expect(region).toHaveAttribute("inert", "")
  await trigger.focus()
  await page.keyboard.press("Enter")
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  await expect(region.getByRole("link")).toBeVisible()
  await expect(region).not.toHaveAttribute("inert", "")
  expect(
    await region.evaluate((node) => getComputedStyle(node).transitionDuration)
  ).toBe("0s")
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.keyboard.press("Space")
  await expect(trigger).toHaveAttribute("aria-expanded", "false")
  await expect(region).toHaveAttribute("inert", "")
  await expect(region).toBeHidden()
  expect(
    await region.evaluate((node) => getComputedStyle(node).transitionDuration)
  ).toContain("0.32s")
  await trigger.click()
  await expect(region.getByRole("link")).toBeVisible()
  await page.screenshot({
    path: `test-results/goals-handbook-${test.info().project.name}.png`,
    animations: "disabled",
    fullPage: true,
  })
})

test("recovery warnings, missing data and muscle filters remain actionable", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/goals.html?mode=poor")
  await expect(
    page.getByRole("heading", { name: "Recovery needs attention" })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Make the next session easier" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Show only areas to review" }).click()
  await expect(
    page.getByText("No muscle groups meet this filter.")
  ).toBeVisible()
  await page
    .getByRole("button", { name: "How this score is calculated" })
    .click()
  await expect(page.getByText(/An unvalidated planning model/)).toBeVisible()
  await page.screenshot({
    path: `test-results/goals-recovery-${test.info().project.name}.png`,
    fullPage: true,
  })
  await page.goto("/tests/visual/fixtures/goals.html?mode=empty")
  await expect(
    page.getByRole("heading", { name: "More data needed" })
  ).toBeVisible()
  await expect(page.getByLabel("Overall score unavailable")).toBeVisible()
  await expect(
    page.getByRole("heading", {
      name: "Fill the gaps before changing the plan",
    })
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
})
