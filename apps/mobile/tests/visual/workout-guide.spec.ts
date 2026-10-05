import { expect, test, type Page } from "@playwright/test"
async function answer(page: Page, label: string) {
  if (
    ["Full body", "Upper body", "Lower body"].includes(label) &&
    !(await page.getByRole("button", { name: label, exact: true }).isVisible())
  )
    await page.getByText("Whole regions", { exact: true }).click()
  await page.getByRole("button", { name: label }).click()
  await page.getByRole("button", { name: "Continue", exact: true }).click()
}
async function brief(page: Page) {
  for (const label of [
    "Full body",
    "Build strength",
    "Full gym",
    "45 minutes",
    "Training regularly",
    "No restrictions",
    "Normal day",
    "Steady pace",
  ])
    await answer(page, label)
  await expect(
    page.getByRole("heading", { name: "Any additional notes?" })
  ).toBeVisible()
}
test("guided creation previews before applying and fits both viewports", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/tests/visual/fixtures/workout-guide.html")
  await expect(
    page.getByRole("button", { name: "Continue", exact: true })
  ).toBeDisabled()
  await expect(page.locator(".studio-canvas")).toHaveCSS("opacity", "1")
  await page.screenshot({
    path: `.impeccable/review/guide-${test.info().project.name}.png`,
    fullPage: true,
  })
  await brief(page)
  await page
    .getByLabel("Any additional notes?")
    .fill("Keep the movements familiar")
  await page.getByRole("button", { name: "Build with AI" }).click()
  await expect(
    page.getByRole("heading", { name: "Full body foundations" })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Workout editor" })
  ).toHaveCount(0)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  ).toBe(false)
  await expect(page.locator(".studio-canvas")).toHaveCSS("opacity", "1")
  await page.screenshot({
    path: `.impeccable/review/guide-preview-${test.info().project.name}.png`,
    fullPage: true,
  })
  await page.getByRole("button", { name: "Open in editor" }).click()
  await expect(
    page.getByRole("heading", { name: "Workout editor" })
  ).toBeVisible()
  expect(
    await page.evaluate(() => sessionStorage.getItem("test-workout-guide"))
  ).toBeNull()
  expect(errors).toEqual([])
})
test("failure keeps answers and notes, retry succeeds", async ({ page }) => {
  await page.goto("/tests/visual/fixtures/workout-guide.html?scenario=failure")
  await brief(page)
  await page.getByLabel("Any additional notes?").fill("Please keep this note")
  await page.getByRole("button", { name: "Build with AI" }).click()
  await expect(page.getByRole("alert")).toContainText("Connection lost")
  await expect(page.getByLabel("Any additional notes?")).toHaveValue(
    "Please keep this note"
  )
  await page.getByRole("button", { name: "Build with AI" }).click()
  await expect(
    page.getByRole("heading", { name: "Full body foundations" })
  ).toBeVisible()
})
test("close and reload restore answers", async ({ page }) => {
  await page.goto("/tests/visual/fixtures/workout-guide.html")
  await answer(page, "Upper body")
  await page.getByRole("button", { name: "Build strength" }).click()
  await page.getByRole("button", { name: "Close guide" }).click()
  await page.getByRole("button", { name: "Resume guide" }).click()
  await expect(
    page.getByRole("button", { name: "Build strength" })
  ).toHaveAttribute("aria-pressed", "true")
  await page.reload()
  await expect(
    page.getByRole("button", { name: "Build strength" })
  ).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "Back", exact: true }).click()
  await page.getByText("Whole regions", { exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Upper body", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
})
test("editing starts at its heading and supports keyboard activation at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto("/tests/visual/fixtures/workout-guide.html?scenario=edit")
  await expect(
    page.getByRole("heading", { name: "Which muscles?" })
  ).toBeFocused()
  // Safari's Tab-to-buttons behavior depends on the macOS keyboard setting.
  // Verify native activation independently of that preference.
  await page.getByRole("button", { name: "Chest", exact: true }).focus()
  await page.keyboard.press("Space")
  await expect(page.getByRole("button", { name: "Chest", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  ).toBe(false)
})

test("selected answer and restriction review are clear and recoverable", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/workout-guide.html")
  await page.getByText("Whole regions", { exact: true }).click()
  await page.getByRole("button", { name: "Full body", exact: true }).click()
  await expect(page.locator(".studio-canvas")).toHaveCSS("opacity", "1")
  await page.screenshot({
    path: `.impeccable/review/guide-selected-${test.info().project.name}.png`,
    fullPage: true,
  })
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  for (const label of [
    "Build strength",
    "Full gym",
    "45 minutes",
    "Training regularly",
    "I have specific restrictions",
    "Normal day",
    "Steady pace",
  ])
    await answer(page, label)
  const notes = page.getByLabel("Any additional notes?")
  await expect(notes).toHaveAttribute("required", "")
  await expect(
    page.getByRole("button", { name: "Build with AI" })
  ).toBeDisabled()
  await notes.fill("Jumping")
  await expect(page.locator("#guide-notes-help")).toBeEmpty()
  await expect(
    page.getByRole("button", { name: "Build with AI" })
  ).toBeEnabled()
  await expect(page.locator(".studio-canvas")).toHaveCSS("opacity", "1")
  await page.screenshot({
    path: `.impeccable/review/guide-review-${test.info().project.name}.png`,
    fullPage: true,
  })
  await page.getByText("Review answers", { exact: true }).click()
  await page
    .getByRole("button", {
      name: "Which muscles? Full body",
    })
    .click()
  await page.getByText("Whole regions", {exact:true}).click()
  await expect(page.getByRole("button", { name: "Full body", exact:true })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await answer(page, "Lower body")
  await expect(
    page.getByRole("heading", { name: "What are we training for?" })
  ).toBeVisible()
  for (const label of [
    "Build strength",
    "Full gym",
    "45 minutes",
    "Training regularly",
    "I have specific restrictions",
    "Normal day",
    "Steady pace",
  ])
    await answer(page, label)
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("test-guide-planning-calls")
    )
  ).toBe("1")
})

test("room follows equipment and loading has in-scene feedback", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto("/tests/visual/fixtures/workout-guide.html?scenario=loading")
  await expect(page.locator(".studio-canvas")).toHaveAttribute(
    "data-ready",
    "true"
  )
  await answer(page, "Full body")
  await answer(page, "Build muscle")
  await page
    .getByRole("button", { name: "Dumbbells only", exact: true })
    .click()
  await expect(page.locator(".studio-canvas")).toHaveAttribute(
    "data-station",
    "dumbbells"
  )
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  for (const label of [
    "45 minutes",
    "Training regularly",
    "No restrictions",
    "Normal day",
    "Steady pace",
  ])
    await answer(page, label)
  await page.getByRole("button", { name: "Build with AI" }).click()
  await expect(page.getByRole("status")).toContainText("Building your workout.")
  await expect(page.locator(".studio-canvas")).toHaveAttribute(
    "data-busy",
    "true"
  )
  await expect(page.locator(".guide-foreground")).toHaveCSS("opacity", "0")
  await expect(page.locator(".guide-foreground")).toHaveAttribute("inert", "")
  await expect(page.locator(".guide-loading")).toHaveCSS("opacity", "1")
  await page.screenshot({
    path: `.impeccable/review/studio-loading-${test.info().project.name}.png`,
    fullPage: true,
  })
  await expect(
    page.getByRole("heading", { name: "Full body foundations" })
  ).toBeVisible()
})
test("a failed room download still permits a complete workout", async ({
  page,
}) => {
  await page.route("**/workout-studio/studio.glb", (route) => route.abort())
  await page.goto("/tests/visual/fixtures/workout-guide.html")
  await expect(page.locator(".studio-background")).toHaveAttribute(
    "data-failed",
    "true"
  )
  await brief(page)
  await page.getByRole("button", { name: "Build with AI" }).click()
  await expect(
    page.getByRole("heading", { name: "Full body foundations" })
  ).toBeVisible()
})

test("custom muscle answer survives reload and reaches generation with final notes", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/workout-guide.html")
  await page.getByRole("button", { name: "Custom answer", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Continue", exact: true })
  ).toBeDisabled()
  await page
    .getByRole("textbox", { name: "Your answer" })
    .fill("Chest, triceps and calves")
  await page.reload()
  await expect(page.getByRole("textbox", { name: "Your answer" })).toHaveValue(
    "Chest, triceps and calves"
  )
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  for (const label of [
    "Build muscle",
    "Full gym",
    "45 minutes",
    "Training regularly",
    "No restrictions",
    "Normal day",
    "Steady pace",
  ])
    await answer(page, label)
  await page
    .getByLabel("Any additional notes?")
    .fill("Prefer cables for triceps")
  await page.getByRole("button", { name: "Build with AI" }).click()
  await expect(
    page.getByRole("heading", { name: "Full body foundations" })
  ).toBeVisible()
  const payload = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("test-guide-payload")!)
  )
  expect(payload.answers.focus).toBe("Custom: Chest, triceps and calves")
  expect(Object.keys(payload.answers)).toHaveLength(8)
  expect(payload.notes).toBe("Prefer cables for triceps")
})

test("multiple muscles persist and the ceiling LED tracks form progress", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/workout-guide.html")
  await expect(page.locator(".studio-canvas")).toHaveAttribute(
    "data-leds",
    "10"
  )
  await expect(page.locator(".studio-canvas")).toHaveAttribute(
    "data-progress",
    "0"
  )
  await page.getByRole("button", { name: "Chest", exact: true }).click()
  await page.getByRole("button", { name: "Triceps", exact: true }).click()
  await expect(page.locator(".studio-canvas")).toHaveAttribute(
    "data-progress",
    String(1 / 9)
  )
  await page.reload()
  await expect(
    page.getByRole("button", { name: "Chest", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(
    page.getByRole("button", { name: "Triceps", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("progressbar")).toHaveCount(0)
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await answer(page, "Build strength")
  await expect(page.locator(".studio-canvas")).toHaveAttribute(
    "data-progress",
    String(2 / 9)
  )
})

test("final notes stay compact and server traces never reach the error box", async ({ page }) => {
  await page.goto("/tests/visual/fixtures/workout-guide.html?scenario=server-error")
  await brief(page)
  const heading = await page.getByRole("heading", { name: "Any additional notes?" }).boundingBox()
  const field = await page.getByLabel("Any additional notes?").boundingBox()
  expect(field!.y - heading!.y - heading!.height).toBeLessThan(100)
  await page.getByLabel("Any additional notes?").fill("Keep my notes")
  await page.getByRole("button", { name: "Build with AI" }).click()
  const alert = page.getByRole("alert")
  await expect(alert).toContainText("Your answers are saved")
  await expect(alert).not.toContainText(/CONVEX|Request ID|private.ts/)
  await expect(page.getByLabel("Any additional notes?")).toHaveValue("Keep my notes")
  await expect(page.locator(".guide-foreground")).toHaveCSS("opacity", "1")
  await page.screenshot({path: `.impeccable/review/guide-final-error-${test.info().project.name}.png`, fullPage: true})
  await page.getByRole("button", { name: "Build with AI" }).click()
  await expect(page.getByRole("heading", { name: "Full body foundations" })).toBeVisible()
})

test("AI editing has one required changes field, one request, and a review before applying", async ({ page }) => {
  await page.goto("/tests/visual/fixtures/workout-guide.html?scenario=quick-edit")
  await expect(page.getByRole("heading", {name: "Describe your changes"})).toBeVisible()
  await expect(page.getByRole("textbox")).toHaveCount(1)
  await expect(page.getByText("Review answers", {exact:true})).toHaveCount(0)
  await expect(page.getByText("Uses 1 AI request", {exact:true})).toBeVisible()
  await expect(page.getByRole("button", {name: "Edit with AI"})).toBeDisabled()
  await page.getByRole("textbox").fill("Swap squats for leg press")
  await expect(page.locator(".studio-canvas")).toHaveAttribute("data-ready", "true")
  await page.screenshot({path:`.impeccable/review/quick-edit-${test.info().project.name}.png`})
  await page.getByRole("button", {name: "Edit with AI"}).click()
  await expect(page.getByRole("heading", {name: "Full body foundations"})).toBeVisible()
  expect(await page.evaluate(()=>sessionStorage.getItem("test-guide-planning-calls"))).toBeNull()
  expect(JSON.parse((await page.evaluate(()=>sessionStorage.getItem("test-guide-payload")))!).notes).toBe("Swap squats for leg press")
  await page.getByRole("button", {name: "Back",exact:true}).click()
  await expect(page.getByRole("textbox")).toHaveValue("Swap squats for leg press")
  await page.getByRole("button", {name: "Edit with AI"}).click()
  await page.getByRole("button", {name: "Open in editor"}).click()
  await expect(page.getByRole("heading", {name: "Workout editor"})).toBeVisible()
})
