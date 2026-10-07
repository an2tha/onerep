import { expect, test } from "@playwright/test"
const url = "/tests/visual/fixtures/programme-setup.html"

test("quiet setup is readable at each step with no horizontal overflow", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  for (const step of [0, 1, 2, 3, 4, 5, 6]) {
    await page.goto(`${url}?step=${step}`)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `../../.impeccable/review/programme-setup-${step}-${info.project.name}.png`,
      fullPage: true,
    })
  }
})

test("the both-track preview discloses ten tokens and preserves answers on failure", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(`${url}?step=6`)
  const generate = page.getByRole("button", {
    name: "Generate · 10 AI tokens",
    exact: false,
  })
  await generate.click()
  await expect(page.getByRole("alert")).toContainText("Your answers are saved")
  await expect(generate).toBeEnabled()
  expect(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("programme-setup-preview")!).settings
          .name,
    ),
  ).toBe("A steadier routine")
})

test("manual mode is free and invalid numbers cannot advance", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(url)
  await page
    .getByRole("button", { name: "Create my own", exact: false })
    .click()
  await page.getByRole("button", { name: "Continue", exact: false }).click()
  await page.getByRole("button", { name: "Training", exact: false }).click()
  await page.getByRole("button", { name: "Continue", exact: false }).click()
  await page.getByRole("button", { name: "Continue", exact: false }).click()
  const days = page.getByRole("spinbutton", {
    name: "Training days per week",
    exact: true,
  })
  await days.fill("9")
  await page.getByRole("button", { name: "Continue", exact: false }).click()
  await expect(days).toBeVisible()
  await days.fill("3")
  await page.getByRole("button", { name: "Continue", exact: false }).click()
  await expect(
    page.getByRole("button", { name: "Open programme builder", exact: false }),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: /Generate/ })).toHaveCount(0)
})
