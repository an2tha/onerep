/**
 * Marketing stills. Signs the demo account into a running dev server and
 * photographs every screen worth showing, at phone size, in both appearances.
 *
 *   cd apps/mobile && bun run dev -- --port 5177 --strictPort
 *   bun run scripts/marketing-shots.ts
 *
 * Port 5177 is not arbitrary: `convex/lib/auth.ts` trusts exactly 5173 and
 * 5177 as local origins, and anything else is turned away by CORS at sign-in.
 *
 * Credentials come from the environment so this file can be read by anyone.
 * Defaults point at the seeded demo account on the dev deployment.
 */
import { chromium, type Page } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"

const BASE = process.env.SHOT_BASE_URL ?? "http://localhost:5177"
const EMAIL = process.env.SHOT_EMAIL ?? "demo-marketing@onerep.test"
const PASSWORD = process.env.SHOT_PASSWORD
const OUT = process.env.SHOT_OUT ?? join(import.meta.dir, "../docs/media/marketing")

const ROUTES = [
  { path: "/", name: "01-today" },
  { path: "/nutrition", name: "02-nutrition" },
  { path: "/workouts", name: "03-training" },
  { path: "/progress", name: "04-progress" },
  { path: "/coach", name: "05-coach" },
  { path: "/supplements", name: "06-supplements" },
]

/** Long enough for the Convex subscriptions to land and the charts to draw. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.waitForTimeout(1400)
}

async function main() {
  if (!PASSWORD) {
    console.error("Set SHOT_PASSWORD (the demo account password).")
    process.exit(1)
  }
  await mkdir(OUT, { recursive: true })

  const browser = await chromium.launch()

  for (const scheme of ["dark", "light"] as const) {
    const context = await browser.newContext({
      viewport: { width: 430, height: 932 },
      deviceScaleFactor: 3,
      colorScheme: scheme,
      // The app is a phone app; a desktop UA gets desktop layout in places.
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    })
    const page = await context.newPage()

    await page.goto(`${BASE}/login`)
    await page.fill('input[name="email"]', EMAIL)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('form button[type="submit"], form button:has-text("Sign in")')
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 30_000,
    })
    await settle(page)

    for (const route of ROUTES) {
      await page.goto(`${BASE}${route.path}`)
      await settle(page)
      const file = join(OUT, `${route.name}-${scheme}.png`)
      await page.screenshot({ path: file })
      console.log(`✓ ${file}`)
    }

    await context.close()
  }

  await browser.close()
}

await main()
