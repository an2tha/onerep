import { chromium } from "@playwright/test"
const b = await chromium.launch()
for (const [name, cls] of [["dark",""],["light","light"]]) {
  const p = await b.newPage({ viewport: { width: 430, height: 820 }, deviceScaleFactor: 2 })
  await p.goto("file://" + process.cwd() + "/d2.html")
  if (cls) await p.evaluate(() => document.documentElement.classList.add("light"))
  await p.waitForTimeout(300)
  await p.screenshot({ path: `/tmp/hero-${name}.png` })
  await p.close()
}
await b.close(); console.log("ok")
