import { expect, test } from "@playwright/test"

test.describe("public application shell", () => {
  test("login", async ({ page }) => {
    await page.goto("/login")
    await expect(page.locator("main")).toBeVisible()
    await expect(page).toHaveScreenshot("login.png", { fullPage: true })
  })
})

test.describe("authenticated top-level destinations", () => {
  test.skip(
    !process.env.E2E_STORAGE_STATE,
    "Set E2E_STORAGE_STATE to a signed-in Playwright storage-state file."
  )

  for (const route of [
    { path: "/", name: "today" },
    { path: "/nutrition", name: "nutrition" },
    { path: "/workouts", name: "training" },
    { path: "/progress", name: "progress" },
    { path: "/coach", name: "coach" },
    { path: "/supplements", name: "supplements" },
    { path: "/settings", name: "settings" },
  ]) {
    test(route.name, async ({ page }) => {
      await page.goto(route.path)
      await expect(page.locator("main, [role='main']").first()).toBeVisible()
      await expect(page).toHaveScreenshot(`${route.name}.png`, {
        fullPage: true,
      })
    })
  }
})
