import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/visual/fixtures/exercise-swap.html")
})

test("cancel leaves completed work untouched; confirming preserves original sets and clears replacement loads", async ({
  page,
}) => {
  const dialog = page.getByRole("dialog", {
    name: "Swap exercise",
    exact: true,
  })
  await page.getByRole("button", { name: "Close swap" }).click()
  await expect(dialog).not.toBeVisible()
  const before = JSON.parse(
    (await page.getByLabel("Workout plan").textContent()) ?? "{}"
  )
  expect(before.exerciseData.e1.sets).toHaveLength(2)
  await page.getByRole("button", { name: "Swap exercise", exact: true }).click()
  await page.getByRole("button", { name: /^Deadlift/ }).click()
  await expect(
    page.getByText("Your 1 completed sets stay with the original exercise.", {
      exact: false,
    })
  ).toBeVisible()
  await expect(
    page.getByRole("radio", { name: "This session only", exact: true })
  ).toBeChecked()
  await expect(
    page.getByRole("radio", {
      name: "This session and saved preset",
      exact: true,
    })
  ).toBeVisible()
  await expect(
    page.getByRole("radio", {
      name: "This session and future sessions in this block",
      exact: true,
    })
  ).toBeVisible()
  await page.getByRole("button", { name: "Confirm swap" }).click()
  await expect(dialog).not.toBeVisible()
  const after = JSON.parse(
    (await page.getByLabel("Workout plan").textContent()) ?? "{}"
  )
  expect(after.exerciseData.e1.sets).toEqual([
    expect.objectContaining({
      id: "performed",
      completed: true,
      weight: "100",
    }),
  ])
  expect(after.exerciseData.e3.sets).toEqual([
    expect.objectContaining({ weight: "", completed: false }),
  ])
})

test("Coach failure keeps manual alternatives available and retry yields a reviewable recommendation", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Ask Coach · 1 AI token" }).click()
  await expect(page.getByRole("alert")).toContainText("Try again")
  await expect(page.getByRole("button", { name: /^Bench Press/ })).toBeEnabled()
  await page.getByRole("button", { name: "Ask Coach · 1 AI token" }).click()
  await expect(
    page.getByText("Keeps lower-body training", { exact: false })
  ).toBeVisible()
  await page.getByRole("button", { name: /^Deadlift/ }).click()
  await expect(
    page.getByRole("spinbutton", { name: "Sets", exact: true })
  ).toHaveValue("3")
  await expect(
    page.getByRole("textbox", { name: "Reps", exact: true })
  ).toHaveValue("6-8")
  await page
    .getByText("This session and future sessions in this block", {
      exact: true,
    })
    .click()
  await page.getByRole("button", { name: "Confirm swap" }).click()
  const mutation = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("swap-mutation") ?? "{}")
  )
  expect(mutation.name).toBe("guidedProgrammes:swapTrainingExercise")
  expect(mutation.args).toMatchObject({
    oldExerciseId: "e1",
    newExerciseId: "e3",
    sets: 3,
    reps: "6-8",
    restSeconds: 120,
  })
})

test("narrow and wide layouts keep the swap sheet within the viewport", async ({
  page,
}) => {
  await expect(page.getByRole("button", { name: /^Deadlift/ })).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth
  )
  expect(overflow).toBe(false)
  await page.screenshot({
    path: `../../.impeccable/review/exercise-swap-${test.info().project.name}.png`,
  })
})
