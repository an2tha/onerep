import { expect, test } from "@playwright/test"

for (const [focus, direction, change, protein] of [
  ["hypertrophy", "Fuel & build", "5", "144"],
  ["deficit", "Gradual step down", "10", "160"],
  ["recomp", "Steady & strong", null, "144"],
  ["endurance", "Steady & strong", null, "128"],
] as const) {
  test(`${focus} preselects its programme and uses maintenance instead of the existing budget`, async ({
    page,
  }) => {
    await page.goto(`/tests/visual/fixtures/goal-nutrition.html?focus=${focus}`)
    await page.getByRole("button", { name: "Open setup" }).click()
    await expect(
      page.getByRole("button", { name: new RegExp(direction) })
    ).toHaveAttribute("aria-pressed", "true")
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await expect(page.getByLabel(/Baseline calories/)).toHaveValue("2600")
    await expect(page.getByLabel("Protein · g/day")).toHaveValue(protein)
    await expect(page.getByLabel(/Daily fasting window/)).toHaveValue("0")
    if (change)
      await expect(page.getByLabel(/Total (increase|decrease)/)).toHaveValue(
        change
      )
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await page.getByRole("dialog").getByRole("checkbox").check()
    await page.getByRole("button", { name: "Start my programme" }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.locator("output")).toContainText(`"goalFocus":"${focus}"`)
    await expect(page.locator("output")).toContainText(
      '"baselineCalories":2600'
    )
  })
}

test("replacement shows today's change and retains edits after a failed save", async ({
  page,
}) => {
  await page.goto(
    "/tests/visual/fixtures/goal-nutrition.html?focus=hypertrophy&replace=1"
  )
  await page.getByLabel("Simulate save failure").check()
  await page.getByRole("button", { name: "Open setup" }).click()
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await page.getByLabel("Protein · g/day").fill("155")
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(
    page.getByText(/Today changes from 2200 to 2600 kcal/)
  ).toBeVisible()
  await page.getByRole("dialog").getByRole("checkbox").check()
  await page.getByRole("button", { name: "Apply changes" }).click()
  await expect(page.getByRole("alert")).toContainText("Couldn't start")
  await expect(page.getByText(/Daily protein: 155 g/)).toBeVisible()
  await page.screenshot({
    path: `test-results/goal-nutrition-review-${test.info().project.name}.png`,
    animations: "disabled",
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.getByRole("button", { name: "Apply changes" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.locator("output")).toContainText('"protein":155')
  await expect(page.locator("output")).toContainText(
    '"replaceProgrammeId":"fixture-programme"'
  )
})

test("missing profile asks for a baseline and protected profile blocks setup", async ({
  page,
}) => {
  await page.goto(
    "/tests/visual/fixtures/goal-nutrition.html?focus=deficit&missing=1"
  )
  await page.getByRole("button", { name: "Open setup" }).click()
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(page.getByLabel(/Baseline calories/)).toHaveValue("")
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Set daily targets" })
  ).toBeVisible()
  await page.getByLabel(/Baseline calories/).fill("2400")
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Review your programme" })
  ).toBeVisible()
  await page.goto("/tests/visual/fixtures/goal-nutrition.html?protected=1")
  await page.getByRole("button", { name: "Open setup" }).click()
  await expect(
    page.getByRole("heading", { name: "Review your nutrition profile" })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0)
})
