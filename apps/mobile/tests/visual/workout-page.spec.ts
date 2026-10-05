import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  // Block auth and ancillary network requests. All workout data is served by
  // the fixture's in-memory Convex client, including exercise resolution.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    })
  )
})

test("actual route completes the final set, stays in simple view and saves", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/tests/visual/fixtures/workout-page.html")
  const complete = page.getByRole("button", {
    name: "Complete set",
    exact: true,
  })
  await expect(complete).toBeVisible()
  await page.screenshot({
    path: `test-results/workout-simple-${test.info().project.name}.png`,
  })
  for (let i = 0; i < 3; i++) await complete.click()
  await expect(page.getByText("Ready to finish", { exact: true })).toBeVisible()
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Finish workout", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "Workout saved" })
  ).toBeVisible()
  expect(errors).toEqual([])
})

test("actual expanded header and cards fit and can finish before the last set", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/workout-page.html")
  await page.getByRole("button", { name: "Switch to expanded view" }).click()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    )
  ).toBe(false)
  const header = page.locator("header.workout-live-header")
  await expect(
    header.getByRole("button", { name: "Complete set", exact: true })
  ).toBeVisible()
  await header
    .getByRole("button", { name: "Complete set", exact: true })
    .click()
  await header.getByRole("button", { name: "Finish", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Finish early?" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Keep going" }).click()
  await page.screenshot({
    path: `test-results/workout-page-${test.info().project.name}.png`,
  })
})

test("Log cardio opens the actual details and retains focus while entering multiple fields", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/workout-page.html?scenario=cardio")
  await page.getByRole("button", { name: "Log cardio", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  const distance = page.getByRole("spinbutton", {
    name: "Distance",
    exact: true,
  })
  await distance.fill("5")
  await expect(distance).toBeFocused()
  await page.getByRole("spinbutton", { name: "Pace minutes" }).fill("6")
  await page.getByRole("spinbutton", { name: "Pace seconds" }).fill("15")
  await page
    .getByRole("spinbutton", { name: "Workout duration minutes" })
    .fill("30")
  await expect(
    page.getByText("Calculated from distance and duration", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("spinbutton", { name: "Pace seconds" })
  ).toHaveCount(0)
  await page.getByText("More details", { exact: true }).click()
  await page.screenshot({
    path: `test-results/workout-cardio-${test.info().project.name}.png`,
  })
  // Duration fields should still be visible after distance makes cardio count
  // as logged. The route must not auto-collapse the form mid-entry.
  await expect(
    page.locator("input").filter({ visible: true }).first()
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    )
  ).toBe(false)
})

test("leaving preserves the latest reps for a later resume", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/workout-page.html")
  await page.getByRole("spinbutton", { name: "Set 1 reps" }).fill("11")
  await page.getByRole("button", { name: "Leave workout", exact: true }).click()
  await page.getByRole("button", { name: "Leave and resume later" }).click()
  await expect(
    page.getByRole("heading", { name: "Workouts", exact: true })
  ).toBeVisible()
  const draft = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("onerep:active-workout-draft:v1:1")!)
  )
  expect(
    Object.values<{ sets: { reps: string }[] }>(draft.exerciseData)[0]!.sets[0]!
      .reps
  ).toBe("11")
})

test("resume recovers unsynced local edits and uses remote data when local data is clean", async ({
  page,
}) => {
  for (const scenario of ["resume", "resume-clean"]) {
    await page.goto(
      `/tests/visual/fixtures/workout-page.html?scenario=${scenario}`
    )
    await expect(
      page.getByRole("dialog", { name: "You have an active workout" })
    ).toBeVisible()
    await page
      .getByRole("button", { name: "Resume workout", exact: true })
      .click()
    await expect(
      page.getByRole("spinbutton", { name: "Set 1 reps" })
    ).toHaveValue(scenario === "resume" ? "12" : "8")
  }
})

test("leaving during creation keeps the device draft attached to the saved session", async ({
  page,
}) => {
  await page.goto(
    "/tests/visual/fixtures/workout-page.html?scenario=slow-create"
  )
  await page.getByRole("spinbutton", { name: "Set 1 reps" }).fill("11")
  await expect(page.locator("html")).toHaveAttribute(
    "data-create-pending",
    "true"
  )
  await page.getByRole("button", { name: "Leave workout", exact: true }).click()
  await page.getByRole("button", { name: "Leave and resume later" }).click()
  await expect(
    page.getByRole("heading", { name: "Workouts", exact: true })
  ).toBeVisible()
  await expect(page.locator("html")).toHaveAttribute(
    "data-created-started-at",
    /\d+/
  )
  const state = await page.evaluate(() => ({
    draft: JSON.parse(
      localStorage.getItem("onerep:active-workout-draft:v1:1")!
    ),
    serverStart: Number(document.documentElement.dataset.createdStartedAt),
  }))
  expect(state.draft.startedAt).toBe(state.serverStart)
  expect(
    Object.values<{ sets: { reps: string }[] }>(state.draft.exerciseData)[0]!
      .sets[0]!.reps
  ).toBe("11")
})

test("instructions and history open over the workout and return to the same set", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/workout-page.html")
  await page.getByRole("button", { name: /How to perform/ }).click()
  const instructions = page.getByRole("dialog")
  await expect(instructions).toBeVisible()
  await expect(
    instructions.getByRole("heading", { name: "Barbell Squat", exact: true })
  ).toBeVisible()
  expect(
    await instructions.evaluate(
      (element) => element.scrollWidth > element.clientWidth
    )
  ).toBe(false)
  await instructions.getByRole("button", { name: "Close instructions" }).click()
  await expect(instructions).toHaveCount(0)
  await expect(
    page.getByRole("spinbutton", { name: "Set 1 reps" })
  ).toHaveValue("8")
  await page.getByRole("button", { name: "Switch to expanded view" }).click()
  const historyOpener = page.getByRole("button", {
    name: "Exercise history",
    exact: true,
  })
  await historyOpener.click()
  const history = page.getByRole("dialog", {
    name: "Exercise history",
    exact: true,
  })
  await expect(
    history.getByText("No history yet", { exact: true })
  ).toBeVisible()
  await history.getByRole("button", { name: "Close history" }).click()
  await expect(history).toHaveCount(0)
  await expect(historyOpener).toBeFocused()
})
