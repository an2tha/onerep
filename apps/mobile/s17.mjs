import { chromium } from "@playwright/test"
const b = await chromium.launch()
for (const [n,c] of [["dark",""],["light","light"]]) {
  const p = await b.newPage({ viewport: { width: 393, height: 620 }, deviceScaleFactor: 2 })
  await p.goto("file://" + process.cwd() + "/cs.html")
  if (c) await p.evaluate(() => document.documentElement.classList.add("light"))
  await p.waitForTimeout(200); await p.screenshot({ path: `/tmp/cs-${n}.png` }); await p.close()
}
await b.close(); console.log("ok")
