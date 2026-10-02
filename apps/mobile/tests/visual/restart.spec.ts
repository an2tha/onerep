import { expect, test } from "@playwright/test"

test("restart setup, errors, retry, progress, adjustment and close", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/restart.html?fail=1")
  await expect(
    page.getByRole("heading", { name: "A little room to begin again." }),
  ).toBeVisible()
  await expect(page.locator(".restart-main section")).toHaveCSS("opacity", "1")
  await page.screenshot({
    path: `test-results/restart-intro-${test.info().project.name}.png`,
    fullPage: true,
  })
  await page
    .getByRole("button", { name: "Help me restart", exact: true })
    .click()
  await page.getByRole("radio", { name: /My energy is low/ }).check()
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(
    page.getByRole("radio", { name: /Make time to rest/ }),
  ).toBeChecked()
  await page.getByRole("radio", { name: /Return to the gym/ }).check()
  await expect(
    page.locator(".restart-option[data-selected=true]"),
  ).toContainText("Return to the gym")
  await page.mouse.move(0, 0)
  await expect(page.locator(".restart-main section")).toHaveCSS("opacity", "1")
  await page.screenshot({
    path: `test-results/restart-choices-${test.info().project.name}.png`,
    fullPage: true,
  })
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await page.getByLabel("Your daily anchor", { exact: true }).fill("")
  await expect(
    page.getByRole("button", { name: "Save my small plan" }),
  ).toBeDisabled()
  await page
    .getByLabel("Your daily anchor", { exact: true })
    .fill("After my afternoon snack")
  await page.getByRole("button", { name: "Save my small plan" }).click()
  await expect(
    page.getByLabel("Your daily anchor", { exact: true }),
  ).toBeDisabled()
  await expect(page.getByRole("alert")).toContainText("couldn't be saved")
  await expect(
    page.getByLabel("Your daily anchor", { exact: true }),
  ).toHaveValue("After my afternoon snack")
  await page.getByRole("button", { name: "Save my small plan" }).click()
  await expect(
    page.getByRole("heading", { name: "Put your gym clothes out" }),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "I'm ready for my small step" })
    .click()
  await expect(
    page.getByRole("button", { name: "Open my workouts" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "I did my small action" }).click()
  await expect(
    page.getByRole("heading", { name: "That's enough for today." }),
  ).toBeVisible()
  await expect(page.locator(".restart-main section")).toHaveCSS("opacity", "1")
  await page.screenshot({
    path: `test-results/restart-return-${test.info().project.name}.png`,
    fullPage: true,
  })
  await expect(page.locator(".restart-today")).toContainText(
    "Do one familiar exercise",
  )
  await page.getByRole("button", { name: "Make it easier" }).click()
  await expect(
    page.getByRole("radio", { name: /Return to the gym/ }),
  ).toBeChecked()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.getByRole("button", { name: "Close restart" }).click()
  await expect(
    page.getByRole("button", { name: "Reopen restart" }),
  ).toBeVisible()
})

test("later-day completion, keyboard and reduced motion", async ({ page }) => {
  await page.goto("/tests/visual/fixtures/restart.html?active=1")
  await expect(page.getByRole("heading")).toBeFocused()
  await page.getByRole("button", { name: "I did my small action" }).focus()
  await page.keyboard.press("Enter")
  await expect(
    page.getByRole("heading", { name: "You made room for yourself." }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Back to Today" }).click()
  await expect(
    page.getByRole("button", { name: "Reopen restart" }),
  ).toBeVisible()
})

test("mobile preview has one header and keeps the action on screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto("/tests/visual/fixtures/restart.html?preview=1")
  await expect(page.locator(".app-route-frame")).not.toHaveAttribute(
    "data-page-bar",
    "true",
  )
  await expect(page.locator("header")).toHaveCount(1)
  await expect(page.locator(".restart-main section")).toHaveCSS("opacity", "1")
  const action = page.getByRole("button", {
    name: "Help me restart",
    exact: true,
  })
  const bounds = await action.boundingBox()
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(852)
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThanOrEqual(853)
  await page.screenshot({
    path: `test-results/restart-mobile-preview-${test.info().project.name}.png`,
    fullPage: true,
  })
  await page.setViewportSize({ width: 375, height: 667 })
  await expect(action).toBeInViewport()
  await action.click()
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeInViewport()
})
