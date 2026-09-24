import { expect, test } from "@playwright/test"

test("page actions are in the top bar from load and remain clickable after scrolling", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/page-actions.html")
  const toolbar = page.locator(".collapsing-page-bar")
  for (const [name, result] of [
    ["Workout date", "Date opened"],
    ["Edit reading", "Editor opened"],
    ["Add reading", "Add opened"],
  ]) {
    const button = toolbar.getByRole("button", { name })
    await expect(button).toBeVisible()
    await expect(page.getByRole("button", { name })).toHaveCount(1)
    await button.click()
    await expect(page.locator("output")).toHaveText(result)
    const box = await button.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  }
  await page.evaluate(() => window.scrollTo(0, 350))
  await toolbar.getByRole("button", { name: "Workout date" }).click()
  await expect(page.locator("output")).toHaveText("Date opened")
  expect((await toolbar.boundingBox())!.y).toBe(0)
  await page.screenshot({
    path: `test-results/page-actions-${test.info().project.name}.png`,
  })
})

test("outgoing snapshot retains screen position and edited input when navigation resets scroll", async ({
  page,
}) => {
  await page.goto("/tests/visual/fixtures/page-actions.html")
  await page
    .getByRole("textbox", { name: "Draft reading" })
    .fill("Unsaved value")
  await page.evaluate(() => window.scrollTo(0, 300))
  const before = await page
    .getByRole("textbox", { name: "Draft reading" })
    .boundingBox()
  await page.getByRole("button", { name: "Next page" }).click()
  const outgoing = page.locator(".app-route-frame-previous")
  await expect(outgoing.locator("input")).toHaveValue("Unsaved value")
  const after = await outgoing.locator("input").boundingBox()
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(1)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect(outgoing).toHaveAttribute("data-page-bar", "true")
})

test("Coach background reaches the top while toolbar spacing stays on content", async ({ page }) => {
  await page.goto("/tests/visual/fixtures/coach-chrome.html")
  await page.waitForFunction(() => document.documentElement.dataset.stylesReady === "true")
  const geometry = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(".coach-mobile-immersive")!
    const backdrop = document.querySelector<HTMLElement>(".coach-background-layer")!
    const content = document.querySelector<HTMLElement>(".coach-content")!
    return { rootTop: root.getBoundingClientRect().top, backdropTop: backdrop.getBoundingClientRect().top, rootPadding: getComputedStyle(root).paddingTop, contentPadding: getComputedStyle(content).paddingTop }
  })
  expect(geometry.backdropTop).toBe(geometry.rootTop)
  expect(geometry.rootPadding).toBe("0px")
  expect(geometry.contentPadding).toBe("60px")
})
