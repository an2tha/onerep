import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

const APP = "http://localhost:5173";
const SHOTS = "/tmp/onerep-demo/shots";

let browser: Browser;
let context: BrowserContext;
let page: Page;
let recording = false;

async function boot(record: boolean) {
  if (context) await context.close().catch(() => {});
  if (!browser) browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    ...(record
      ? { recordVideo: { dir: "/tmp/onerep-demo/videos", size: { width: 390, height: 844 } } }
      : {}),
  });
  recording = record;
  page = await context.newPage();
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  return "booted" + (record ? " (recording)" : "");
}

await boot(false);

Bun.serve({
  port: 8765,
  idleTimeout: 240,
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/eval") {
        const code = await req.text();
        const fn = new Function(
          "page",
          "context",
          "boot",
          "SHOTS",
          `return (async () => { ${code} })()`
        );
        const result = await fn(page, context, boot, SHOTS);
        // page may have been replaced by boot()
        const pages = context.pages();
        if (pages.length > 0) page = pages[pages.length - 1];
        return new Response(JSON.stringify(result ?? null, null, 2));
      }
      if (url.pathname === "/shot") {
        const name = url.searchParams.get("name") ?? "shot";
        const path = `${SHOTS}/${name}.png`;
        await page.screenshot({ path });
        return new Response(path);
      }
      if (url.pathname === "/reboot") {
        const record = url.searchParams.get("record") === "1";
        return new Response(await boot(record));
      }
      if (url.pathname === "/stopvideo") {
        const video = page.video();
        await context.close();
        const path = video ? await video.path() : "no video";
        recording = false;
        context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
        });
        page = await context.newPage();
        return new Response(path);
      }
      return new Response("unknown route", { status: 404 });
    } catch (e: any) {
      return new Response("ERROR: " + (e?.message ?? String(e)), { status: 500 });
    }
  },
});

console.log("driver ready on :8765");
