import { expect, test } from "@playwright/test"

test("search owns the viewport, keeps focus and results steady, and closes immediately", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/workout-search.html")
  await page.getByRole("button", { name: "Add exercise", exact: true }).focus()
  await page.getByRole("button", { name: "Add exercise", exact: true }).press("Enter")
  const dialog = page.getByRole("dialog", { name: "Add exercises" })
  const input = dialog.getByRole("searchbox")
  await expect(input).toBeFocused()
  expect(
    await input.evaluate((element) => getComputedStyle(element).fontSize)
  ).toBe("16px")
  const close = dialog.getByRole("button", { name: "Close exercise search" })
  const ownsClose = await close.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return element.contains(
      document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2
      )
    )
  })
  expect(ownsClose).toBe(true)
  expect(
    await dialog.evaluate(
      (element) =>
        element.closest(".exercise-search-overlay")?.parentElement ===
        document.body
    )
  ).toBe(true)
  await input.fill("bench")
  const result = dialog.getByRole("button", {
    name: "Add Bench Press",
    exact: true,
  })
  await expect(result).toBeVisible()
  const before = await close.boundingBox()
  await input.fill("bench ")
  await expect(result).toBeVisible()
  await expect(input).toBeFocused()
  expect(await close.boundingBox()).toEqual(before)
  await result.click()
  await expect(
    dialog.getByRole("button", { name: "Bench Press, already added" })
  ).toBeDisabled()
  await input.fill("dead")
  // Existing rows remain readable during the next request.
  await expect(
    dialog.getByRole("button", { name: "Bench Press, already added" })
  ).toBeVisible()
  await expect(
    dialog.getByRole("button", { name: "Add Deadlift", exact: true })
  ).toBeVisible()
  await page.screenshot({
    path: `test-results/workout-search-${test.info().project.name}.png`,
  })
  await close.evaluate((element: HTMLButtonElement) => element.click())
  await expect(dialog).toHaveCount(0, { timeout: 200 })
  await expect(
    page.getByRole("button", { name: "Add exercise", exact: true })
  ).toBeFocused()
  await expect(page.locator("output")).toHaveText("Bench Press")
})

test("touch opening and closing leaves the workout controls usable", async ({ page }) => {
  await page.goto("/tests/visual/fixtures/workout-search.html")
  const opener = page.getByRole("button", { name: "Add exercise", exact: true })
  await opener.click()
  await expect(page.getByRole("searchbox")).toBeFocused()
  await page.getByRole("button", { name: "Close exercise search" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await opener.click()
  await expect(page.getByRole("searchbox")).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("")
})
