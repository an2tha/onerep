import { expect, test } from "@playwright/test"

test("Cloud explains the key restriction and opens Server settings", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/ai-key.html")
  await expect(
    page.getByText(
      "Personal OpenRouter keys are available only on self-hosted servers."
    )
  ).toBeVisible()
  await expect(
    page.getByLabel("OpenRouter API key", { exact: true })
  ).toHaveCount(0)
  await page.screenshot({
    path: `test-results/ai-key-cloud-${test.info().project.name}.png`,
    fullPage: true,
  })
  await page.getByRole("button", { name: /Your own AI key/ }).click()
  await expect(
    page.getByRole("heading", { name: "Server settings" })
  ).toBeVisible()
})

test("self-hosted key entry saves by keyboard, masks the key, and removes it", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/ai-key.html?selfhosted=1")
  const input = page.getByLabel("OpenRouter API key", { exact: true })
  const save = page.getByRole("button", { name: "Save OpenRouter key" })
  await expect(save).toBeDisabled()
  await expect(input).toHaveAttribute("type", "password")
  await input.fill("invalid")
  await expect(save).toBeDisabled()
  await input.fill("  sk-or-test-abcd  ")
  await expect(save).toBeEnabled()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: `test-results/ai-key-${test.info().project.name}.png`,
    fullPage: true,
  })
  await input.press("Enter")
  await expect(save).toBeDisabled()
  await expect(
    page.getByRole("button", { name: /Key ending in abcd/ })
  ).toBeVisible()
  await expect(input).toHaveCount(0)
  await page.getByRole("button", { name: /Key ending in abcd/ }).click()
  await expect(input).toBeVisible()
  await expect(input).toHaveValue("")
})

test("a failed verification preserves the draft and allows retry", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/ai-key.html?selfhosted=1&fail=1")
  const input = page.getByLabel("OpenRouter API key", { exact: true })
  await input.fill("sk-or-test-abcd")
  await page.getByRole("button", { name: "Save OpenRouter key" }).click()
  await expect(
    page.getByText("This API key is invalid. Check it and try again.")
  ).toBeVisible()
  await expect(input).toHaveValue("sk-or-test-abcd")
  await page.getByRole("checkbox", { name: "Simulate failure" }).uncheck()
  await page.getByRole("button", { name: "Save OpenRouter key" }).click()
  await expect(
    page.getByRole("button", { name: /Key ending in abcd/ })
  ).toBeVisible()
})

test("a legacy Cloud key remains removable and cannot be replaced", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/ai-key.html?configured=1&fail=1")
  const remove = page.getByRole("button", { name: /Key ending in abcd/ })
  await remove.click()
  await expect(page.getByText("Couldn't remove the key")).toBeVisible()
  await expect(remove).toBeEnabled()
  await page.getByRole("checkbox", { name: "Simulate failure" }).uncheck()
  await remove.click()
  await expect(
    page.getByText(
      "Personal OpenRouter keys are available only on self-hosted servers."
    )
  ).toBeVisible()
  await expect(
    page.getByLabel("OpenRouter API key", { exact: true })
  ).toHaveCount(0)
})

test("loading does not offer a key or claim it is unavailable", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/ai-key.html?loading=1")
  await expect(page.getByText("Loading…")).toBeVisible()
  await expect(
    page.getByText(
      "Personal OpenRouter keys are available only on self-hosted servers."
    )
  ).toHaveCount(0)
  await expect(
    page.getByLabel("OpenRouter API key", { exact: true })
  ).toHaveCount(0)
})
