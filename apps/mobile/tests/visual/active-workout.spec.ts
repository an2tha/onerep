import { expect, test } from "@playwright/test"

const fixture = "/tests/visual/fixtures/active-workout.html"

test.beforeEach(async ({ page }) => {
  await page.goto(fixture)
  await expect(
    page.getByRole("button", { name: "Complete set", exact: true })
  ).toBeVisible()
})

test("edit weight and reps, log, rest, finish and undo without losing the simple view", async ({
  page,
}) => {
  const reps = page.getByRole("spinbutton", { name: "Set 1 reps" })
  await reps.fill("12")
  expect(
    await reps.evaluate((element) => getComputedStyle(element).fontSize)
  ).toBe("16px")
  await page.getByRole("button", { name: "One rep more" }).click()
  await expect(reps).toHaveValue("13")
  await page.getByRole("button", { name: "Weight: 60 kg. Change it" }).click()
  const dialog = page.getByRole("dialog", { name: "Weight selector" })
  await dialog
    .getByRole("spinbutton", { name: "Total weight in kg" })
    .fill("62.5")
  await dialog.getByRole("button", { name: "Done", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Weight: 62.5 kg. Change it" })
  ).toBeFocused()
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole("button", { name: "Complete set", exact: true })
      .click()
    if (i < 2) {
      await expect(
        page.getByRole("button", { name: "Skip rest", exact: true })
      ).toBeVisible()
      await page.getByRole("button", { name: "Skip rest", exact: true }).click()
    }
  }
  await expect(page.getByText("Ready to finish", { exact: true })).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Finish workout", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Skip rest", exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Switch to expanded view" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Undo set 3", exact: true }).click()
  await expect(
    page.getByRole("spinbutton", { name: "Set 3 reps" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Complete set", exact: true })
  ).toBeVisible()
})

test("expanded rows fit narrow screens, have touch targets, and delete through set settings", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Switch to expanded view" }).click()
  const target = await page
    .getByRole("button", { name: "Mark set complete" })
    .first()
    .boundingBox()
  expect(target!.width).toBeGreaterThanOrEqual(44)
  expect(target!.height).toBeGreaterThanOrEqual(44)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    )
  ).toBe(false)
  await page.getByRole("button", { name: "Set 1 rest time" }).click()
  const rest = page.getByRole("dialog", { name: "Rest timer", exact: true })
  await rest.getByRole("spinbutton", { name: "Custom rest minutes" }).fill("2")
  await rest.getByRole("spinbutton", { name: "Custom rest seconds" }).fill("15")
  await rest.getByRole("button", { name: "Set", exact: true }).click()
  await expect(rest).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Set 1 rest time" })
  ).toContainText("2:15")
  await page.getByRole("button", { name: "Set 2 rest time" }).click()
  await page.getByRole("button", { name: "Delete this set" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Mark set complete" })
  ).toHaveCount(2)
  await page.screenshot({
    path: `test-results/workout-rows-${test.info().project.name}.png`,
  })
})

test("finish stays open during a request, reports failure locally and retries once", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open finish", exact: true }).click()
  const dialog = page.getByRole("dialog", {
    name: "Finish workout?",
    exact: true,
  })
  await dialog
    .getByRole("button", { name: "Finish workout", exact: true })
    .click()
  await expect(
    dialog.getByRole("button", { name: "Finishing..." })
  ).toBeDisabled()
  await page.keyboard.press("Escape")
  await page.evaluate(() => {
    document.dispatchEvent(new Event("fixture-device-back"))
    document.dispatchEvent(new Event("fixture-device-back"))
  })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("alert")).toContainText(
    "Your progress is still here"
  )
  await expect(page.getByLabel("Requests")).toHaveText("1")
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden")
  await dialog
    .getByRole("button", { name: "Finish workout", exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByLabel("Outcome")).toHaveText("finished")
  await expect(page.getByLabel("Requests")).toHaveText("2")
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("")
})

test("leave keeps progress, empty sessions cannot finish, and remove can be canceled", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Leave workout", exact: true }).click()
  await page.getByRole("button", { name: "Leave and resume later" }).click()
  await expect(page.getByLabel("Outcome")).toHaveText("left with progress")
  await expect(
    page.getByRole("spinbutton", { name: "Set 1 reps" })
  ).toHaveValue("8")
  await page.getByRole("button", { name: "Open empty" }).click()
  await expect(
    page.getByRole("heading", { name: "No activity logged yet" })
  ).toBeVisible()
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Finish workout" })
  ).toBeDisabled()
  await page.getByRole("button", { name: "Keep going" }).click()
  await page.getByRole("button", { name: "Open remove" }).click()
  await page.getByRole("button", { name: "Keep it" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

test("resuming requires a second explicit discard step and recovers from failure", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open resume" }).click()
  await page
    .getByRole("button", { name: "Discard workout", exact: true })
    .click()
  await expect(page.getByLabel("Requests")).toHaveText("0")
  await page.getByRole("button", { name: "Confirm discard" }).click()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(page.getByRole("alert")).toContainText("Try again or resume it")
  await page
    .getByRole("button", { name: "Resume workout", exact: true })
    .click()
  await expect(page.getByLabel("Outcome")).toHaveText("resumed")
})

test("Coach keeps the proposal visible when applying fails, then retries", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open coach" }).click()
  const dialog = page.getByRole("dialog", {
    name: "Ask Coach for workout help",
  })
  await dialog
    .getByRole("textbox", { name: "Workout help request" })
    .fill("Lower the remaining weight")
  await dialog.getByRole("button", { name: "Ask Coach", exact: true }).click()
  await expect(
    dialog.getByRole("button", { name: "Use this plan" })
  ).toBeVisible()
  await dialog.getByRole("button", { name: "Use this plan" }).click()
  await page.keyboard.press("Escape")
  await expect(dialog.getByRole("alert")).toContainText(
    "Could not apply this plan"
  )
  await expect(dialog.getByText("Lighter upper body session")).toBeVisible()
  await dialog.getByRole("button", { name: "Use this plan" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByLabel("Outcome")).toHaveText("plan applied")
})

test("past workout fields fit and retain values after a failed save", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open retro" }).click()
  const dialog = page.getByRole("dialog", { name: "Save this workout" })
  await dialog
    .getByRole("spinbutton", { name: "Workout duration minutes" })
    .fill("45")
  await dialog.getByRole("button", { name: "Log workout", exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("alert")).toContainText(
    "Your entries are still here"
  )
  await expect(
    dialog.getByRole("spinbutton", { name: "Workout duration minutes" })
  ).toHaveValue("45")
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth > element.clientWidth
    )
  ).toBe(false)
  await dialog.getByRole("button", { name: "Log workout", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByLabel("Outcome")).toHaveText("past saved")
})

test("nested sheets dismiss only the top layer and restore focus and scroll locks", async ({
  page,
}) => {
  const opener = page.getByRole("button", { name: "Open parent" })
  await opener.click()
  const parent = page.getByRole("dialog", { name: "Parent sheet" })
  const nestedOpener = parent.getByRole("button", {
    name: "Open nested weight",
  })
  await nestedOpener.click()
  const weight = page.getByRole("dialog", { name: "Weight selector" })
  await weight
    .getByRole("spinbutton", { name: "Total weight in kg" })
    .fill("72.5")
  await page.keyboard.press("Tab")
  expect(
    await weight.evaluate((element) => element.contains(document.activeElement))
  ).toBe(true)
  await page.keyboard.press("Escape")
  await expect(weight).toHaveCount(0)
  await expect(parent).toBeVisible()
  await expect(nestedOpener).toBeFocused()
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden")
  await page.keyboard.press("Escape")
  await expect(parent).toHaveCount(0)
  await expect(opener).toBeFocused()
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("")
})

test("each workout sheet fits the viewport and keeps its actions reachable", async ({
  page,
}) => {
  for (const state of [
    "finish",
    "leave",
    "abort",
    "resume",
    "remove",
    "coach",
    "retro",
    "dictation",
  ]) {
    await page
      .getByRole("button", { name: `Open ${state}`, exact: true })
      .click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    const viewport = page.viewportSize()!
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox()
        return (
          box !== null &&
          box.y >= -1 &&
          box.y + box.height <= viewport.height + 1
        )
      })
      .toBe(true)
    const box = await dialog.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(box!.y).toBeGreaterThanOrEqual(-1)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1)
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth > element.clientWidth
      )
    ).toBe(false)
    await dialog.getByRole("button").last().scrollIntoViewIfNeeded()
    await expect(dialog.getByRole("button").last()).toBeInViewport()
    await page.screenshot({
      path: `test-results/workout-${state}-${test.info().project.name}.png`,
    })
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
  }
})

test("sheets follow the visible viewport and keep focused fields and actions usable", async ({
  page,
}) => {
  for (const state of ["parent", "coach"]) {
    await page
      .getByRole("button", { name: `Open ${state}`, exact: true })
      .click()
    let dialog = page.getByRole("dialog").last()
    if (state === "parent") {
      await dialog.getByRole("button", { name: "Open nested weight" }).click()
      dialog = page.getByRole("dialog", { name: "Weight selector" })
    }
    const input =
      state === "parent"
        ? dialog.getByRole("spinbutton", { name: "Total weight in kg" })
        : dialog.getByRole("textbox", { name: "Workout help request" })
    await input.fill(state === "parent" ? "65" : "Keep my completed sets")
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, "height", {
        value: 260,
        configurable: true,
      })
      window.visualViewport!.dispatchEvent(new Event("resize"))
    })
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox()
        return box !== null && box.y >= -1 && box.y + box.height <= 261
      })
      .toBe(true)
    await expect(input).toBeFocused()
    const action = dialog.getByRole("button").last()
    await action.scrollIntoViewIfNeeded()
    await expect(action).toBeInViewport()
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    if (state === "parent") {
      const parent = page.getByRole("dialog", { name: "Parent sheet" })
      await expect
        .poll(async () => {
          const box = await parent.boundingBox()
          return box !== null && box.y >= -1 && box.y + box.height <= 261
        })
        .toBe(true)
      await page.keyboard.press("Escape")
      await expect(parent).toHaveCount(0)
    }
    await page.evaluate(() => {
      Reflect.deleteProperty(window.visualViewport!, "height")
      window.visualViewport!.dispatchEvent(new Event("resize"))
    })
  }
})
