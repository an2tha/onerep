import { expect, test } from "@playwright/test"

const fixture = "/tests/visual/fixtures/admin-analytics.html"

test("social tabs support keyboard switching, preserve date filters, and collapse missing metrics", async ({
  page,
}) => {
  await page.goto(`${fixture}?tiktok=1&instagram=1`)
  const tiktok = page.getByRole("tab", { name: "TikTok", exact: true })
  const instagram = page.getByRole("tab", { name: "Instagram", exact: true })
  const social = page.getByRole("region", {
    name: "Social analytics",
    exact: true,
  })
  await expect(tiktok).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("tabpanel")).toHaveCount(1)
  await social.getByRole("button", { name: "30 days", exact: true }).click()
  await tiktok.focus()
  await page.keyboard.press("ArrowRight")
  await expect(instagram).toBeFocused()
  await expect(instagram).toHaveAttribute("aria-selected", "true")
  await expect(social.getByText("4", { exact: true })).toBeVisible()
  await expect(
    social.getByText("Unavailable metrics (5)", { exact: true })
  ).toBeVisible()
  await expect(
    social.getByText("Views on this content", { exact: true })
  ).toBeHidden()
  await expect(
    page.getByRole("region", { name: "TikTok", exact: true })
  ).toBeHidden()
  await page.keyboard.press("Home")
  await expect(tiktok).toBeFocused()
  await expect(
    social.getByRole("button", { name: "30 days", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("ArrowLeft")
  await expect(instagram).toBeFocused()
  await page.keyboard.press("Home")
  await page.keyboard.press("End")
  await expect(instagram).toBeFocused()
  await expect(page.getByRole("tabpanel")).toHaveCount(1)
})

test("More shows Analytics only after confirmed admin authorization", async ({
  page,
}) => {
  for (const state of ["denied", "access-loading"]) {
    await page.goto(`${fixture}?more=1&${state}=1`)
    await expect(
      page.getByRole("heading", { name: "More", exact: true })
    ).toBeVisible()
    await expect(page.getByRole("button", { name: /^Analytics / })).toHaveCount(
      0
    )
    await expect(page.getByRole("button", { name: /^Settings / })).toBeVisible()
    expect(
      await page.locator("body").getAttribute("data-report-calls")
    ).toBeNull()
  }
  await page.goto(`${fixture}?more=1`)
  await expect(page.getByRole("button", { name: /^Analytics / })).toBeVisible()
})

test("shows aggregate metrics, mature rates, pending cohorts, and scrollable table", async ({
  page,
}) => {
  await page.goto(fixture)
  await expect(
    page.locator("dl").getByText("142", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("cell", { name: "4 / 10 (40%)", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("cell", { name: "No activated users", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("cell", { name: "Pending", exact: true })
  ).toHaveCount(3)
  await expect(
    page.getByRole("cell", { name: "0 / 3 (0%)", exact: true })
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.getByRole("region", { name: "Signup cohort table" }).focus()
  await expect(
    page.getByRole("region", { name: "Signup cohort table" })
  ).toBeFocused()
  await page.screenshot({
    path: `test-results/analytics-${test.info().project.name}.png`,
    fullPage: true,
  })
})

test("denied and access-loading states never fetch a report", async ({
  page,
}) => {
  await page.goto(`${fixture}?denied=1`)
  await expect(
    page.getByText(/Analytics is restricted to administrators/)
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Refresh" })).toHaveCount(0)
  expect(
    await page.locator("body").getAttribute("data-report-calls")
  ).toBeNull()
  expect(
    await page.locator("body").getAttribute("data-tiktok-requested")
  ).toBeNull()
  await page.goto(`${fixture}?access-loading=1`)
  await expect(page.getByRole("status")).toHaveText("Checking admin access…")
  expect(
    await page.locator("body").getAttribute("data-report-calls")
  ).toBeNull()
  expect(
    await page.locator("body").getAttribute("data-tiktok-requested")
  ).toBeNull()
})

test("Instagram shows real followers, unavailable history and honest date filters", async ({
  page,
}) => {
  await page.goto(`${fixture}?instagram=1`)
  await page.getByRole("tab", { name: "Instagram", exact: true }).click()
  const social = page.getByRole("region", { name: "Instagram", exact: true })
  await expect(
    social.getByRole("link", { name: "@onerep_app" })
  ).toHaveAttribute("href", "https://www.instagram.com/onerep_app/")
  await expect(
    social.locator("dl").getByText("4", { exact: true })
  ).toBeVisible()
  const unavailable = social.locator("details").filter({
    has: page.locator("summary", { hasText: /^Unavailable metrics \(/ }),
  })
  await expect(unavailable).not.toHaveAttribute("open")
  await expect(social.getByText("Net followers", { exact: true })).toBeHidden()
  await social.getByText("Unavailable metrics (5)", { exact: true }).click()
  await expect(social.getByText("Net followers", { exact: true })).toBeVisible()
  await expect(unavailable.locator("dt")).toHaveCount(5)
  await expect(
    social.getByText("Content history unverified", { exact: true })
  ).toBeVisible()
  await expect(social.getByRole("figure")).toHaveCount(0)
  await social.getByRole("button", { name: "30 days", exact: true }).click()
  await expect(social).toContainText("24 Sept to 23 Oct")
  await expect(
    social.getByText("View daily numbers", { exact: true })
  ).toHaveCount(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: `test-results/analytics-instagram-${test.info().project.name}.png`,
    fullPage: true,
  })
  await page.goto(`${fixture}?instagram=1&instagram-zero-test=1`)
  await page.getByRole("tab", { name: "Instagram", exact: true }).click()
  await expect(
    social.getByText("No feed posts or reels published in this period.")
  ).toBeVisible()
  await expect(social.locator("dl dd").filter({ hasText: /^0$/ })).toHaveCount(
    3
  )
  await page.goto(`${fixture}?denied=1`)
  expect(
    await page.locator("body").getAttribute("data-instagram-requested")
  ).toBeNull()
  await page.goto(`${fixture}?access-loading=1`)
  expect(
    await page.locator("body").getAttribute("data-instagram-requested")
  ).toBeNull()
  await page.goto(`${fixture}?instagram-loading=1`)
  await page.getByRole("tab", { name: "Instagram", exact: true }).click()
  await expect(social.getByText("Loading Instagram snapshot…")).toBeVisible()
})

test("TikTok shows real totals by publishing period and preserves genuine zero", async ({
  page,
}) => {
  await page.goto(`${fixture}?tiktok=1`)
  const social = page.getByRole("region", { name: "TikTok", exact: true })
  await expect(
    social.locator("dl").getByText("3,717", { exact: true })
  ).toBeVisible()
  await expect(social.getByText("0.32%", { exact: true })).toBeVisible()
  await expect(
    social.getByRole("link", { name: "Workout logging" })
  ).toHaveAttribute(
    "href",
    "https://www.tiktok.com/@onerep.life/video/7699502918365351190"
  )
  await social.getByRole("button", { name: "Yesterday", exact: true }).click()
  await expect(
    social.getByText("No videos published in this period.")
  ).toBeVisible()
  await expect(social.locator("dl dd").filter({ hasText: /^0$/ })).toHaveCount(
    3
  )
  await social.getByRole("button", { name: "30 days", exact: true }).click()
  await expect(
    social.locator("dl").getByText("4,311", { exact: true })
  ).toBeVisible()
  await social.getByText("Scope & unavailable metrics", { exact: true }).click()
  await expect(
    social.getByText(/Period-wide account activity is not verified yet/)
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: `test-results/analytics-tiktok-${test.info().project.name}.png`,
    fullPage: true,
  })
})

test("TikTok handles loading, absent snapshots, stale data, and unverified video history", async ({
  page,
}) => {
  await page.goto(`${fixture}?tiktok-loading=1`)
  await expect(page.getByText("Loading TikTok snapshot…")).toBeVisible()
  await page.goto(fixture)
  await expect(
    page.getByText(/No TikTok snapshot has been synced yet/)
  ).toBeVisible()
  await page.goto(`${fixture}?tiktok=1&tiktok-stale=1&tiktok-unverified=1`)
  const social = page.getByRole("region", { name: "TikTok", exact: true })
  await expect(social.getByText(/Snapshot older than 36 hours/)).toBeVisible()
  await expect(social.getByRole("figure")).toHaveCount(0)
  await expect(
    social.getByText("Videos published", { exact: true })
  ).toBeHidden()
  await social.getByText("Unavailable metrics (5)", { exact: true }).click()
  await expect(
    social.getByText("Videos published", { exact: true })
  ).toBeVisible()
  await expect(social.locator("dl dd").filter({ hasText: /^0$/ })).toHaveCount(
    0
  )
  await expect(social.locator("details[open] dl dt")).toHaveCount(5)
})

test("TikTok charts compare equal periods, preserve zero, and never fabricate follower growth", async ({
  page,
}) => {
  await page.goto(`${fixture}?tiktok=1`)
  const social = page.getByRole("region", { name: "TikTok", exact: true })
  const views = social.getByRole("figure", { name: "TikTok video views chart" })
  const followers = social.getByRole("figure", {
    name: "TikTok follower growth chart",
  })
  await expect(views).toContainText("+3,415 vs previous (+1,130.8%)")
  await expect(followers).toHaveCount(0)
  await expect(social.getByText("Net followers", { exact: true })).toBeHidden()
  await social.getByText("View daily numbers", { exact: true }).click()
  await expect(
    social
      .getByRole("region", { name: "TikTok daily numbers" })
      .getByRole("row")
  ).toHaveCount(8)
  await social.getByRole("button", { name: "Yesterday", exact: true }).click()
  await expect(views).toContainText("-1,591 vs previous (-100%)")
  await social.getByRole("button", { name: "30 days", exact: true }).click()
  await expect(views).toContainText("+4,311 vs previous (0)")
  await page.goto(`${fixture}?tiktok=1&tiktok-followers-test=1`)
  await expect(followers).toContainText("0 vs previous (1)")
  await expect(followers.getByText("+1", { exact: true })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
})

test("loading, errors, retries, and failed refresh preserve honest values", async ({
  page,
}) => {
  await page.goto(`${fixture}?loading=1`)
  await expect(page.getByRole("button", { name: "Refreshing…" })).toBeDisabled()
  await expect(page.getByRole("table")).toHaveCount(0)
  await page.goto(`${fixture}?error=1`)
  await expect(page.getByRole("alert")).toContainText(
    "Could not load analytics"
  )
  await expect(page.getByRole("table")).toHaveCount(0)
  await page
    .getByRole("checkbox", { name: "Simulate failed refresh" })
    .uncheck()
  await page.getByRole("button", { name: "Refresh", exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect(
    page.locator("dl").getByText("142", { exact: true })
  ).toBeVisible()
  await page.getByRole("checkbox", { name: "Simulate failed refresh" }).check()
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText(
    "The previous report remains below"
  )
  await expect(
    page.locator("dl").getByText("142", { exact: true })
  ).toBeVisible()
})

test("trend inspection, range selection, definitions, and older cohorts work", async ({
  page,
}) => {
  await page.goto(`${fixture}?long=1`)
  const chart = page.getByRole("group", {
    name: "Weekly signup and activity chart",
  })
  await expect(chart.getByRole("button")).toHaveCount(12)
  await page.getByLabel("Trend range").selectOption("8")
  await expect(chart.getByRole("button")).toHaveCount(8)
  const week = chart.getByRole("button", { name: /Week of 2026-09-28:/ })
  await week.focus()
  await page.keyboard.press("Enter")
  await expect(week).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("Week of 28 Sept", { exact: true })).toBeVisible()
  await page.getByText("View weekly numbers", { exact: true }).click()
  await expect(
    page.getByLabel("Weekly numbers").getByRole("table")
  ).toBeVisible()
  await page.getByText("About these metrics", { exact: false }).click()
  await expect(
    page.getByRole("heading", { name: "Coverage & privacy" })
  ).toBeVisible()
  const table = page.getByRole("region", { name: "Signup cohort table" })
  await expect(table.getByRole("row")).toHaveCount(13)
  await page.getByRole("button", { name: "Show all 14 cohorts" }).click()
  await expect(table.getByRole("row")).toHaveCount(15)
  await page.getByRole("button", { name: "Show latest 12" }).click()
  await expect(table.getByRole("row")).toHaveCount(13)
})

test("empty and unavailable history differ from zero", async ({ page }) => {
  await page.goto(`${fixture}?empty=1`)
  await expect(
    page.getByText("No eligible signups yet.", { exact: false })
  ).toBeVisible()
  await expect(page.locator("dl dd").filter({ hasText: /^0$/ })).toHaveCount(5)
  await page.goto(`${fixture}?unavailable=1`)
  await expect(
    page.locator("dl").getByText("Unavailable", { exact: true })
  ).toHaveCount(2)
  await expect(
    page
      .getByRole("region", { name: "Signup cohort table" })
      .getByRole("cell", { name: "Unavailable", exact: true })
  ).toHaveCount(2)
  await expect(
    page.getByRole("cell", { name: "0 / 3 (0%)", exact: true })
  ).toBeVisible()
})
