import { Capacitor } from "@capacitor/core"
import {
  createNeedleSession,
  type CreateNeedleOptions,
  type NeedleSession,
} from "@repo/needle"
import { otaOrigin } from "@/lib/ota"

/**
 * The app's one Needle 2 session.
 *
 * `@repo/needle` knows nothing about this app; this file is where it is told
 * where the engine lives and what today's date is. Everything else — tools,
 * thresholds, loops — belongs to whichever screen is asking, because a toolbox
 * shared across screens is a grammar the model has to guess its way through.
 */

/**
 * Where `needle.js`, `needle.wasm` and `needle2.cact` are served from.
 *
 * Read on the web and, in practice, nowhere else: the native archives link the
 * `.cact` in as `needle_weights`, so an iPhone already has the model before it
 * has a network. This still answers correctly for native because a build
 * running tuned weights would fetch them, and because the answer has to be an
 * absolute origin when it does — the assets live outside the OTA bundle, and a
 * root-relative path resolves inside whichever bundle Capgo installed last, so
 * it 404s after the first update. The same rule, for the same reason, as
 * `modelBase` in `onnx-runtime.ts`.
 *
 * On the web it must not be. The same origin already serves `public/needle`
 * under Vite and from the Pages deploy, and pointing the browser at production
 * instead fails in the least helpful way available: Pages answers an unknown
 * path with the SPA shell, so the fetch succeeds with a 200 and the runtime
 * reports a wasm compile error for what is really an HTML page.
 */
export function needleBase() {
  return Capacitor.isNativePlatform() ? `${otaOrigin()}/needle` : "/needle"
}

/**
 * Environment facts for the system turn — facts, never instructions.
 *
 * The model resolves "tomorrow at seven" against `date:` and passes the human
 * phrase through verbatim when nothing licenses the resolution, which is the
 * entire reason this is not hard-coded to a build-time constant. Anything
 * written here that reads as an order is simply ignored, so there is no prompt
 * to tune and nothing to leak.
 */
export function needleFacts(now = new Date()) {
  const day = now.toDateString().slice(0, 3)
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  return [
    `date: ${date} ${day} ${time}`,
    `locale: ${navigator.language}`,
    `device: ${Capacitor.isNativePlatform() ? "phone" : "desktop"}`,
    "assistant: OneRep",
  ].join("; ")
}

let pending: Promise<NeedleSession> | null = null

/**
 * The session, created once and reused.
 *
 * Held as the promise rather than the value so that two screens mounting in the
 * same frame share one 14 MB download instead of racing to start two. There is
 * only one engine in the process regardless — the C API is four free functions
 * over a global — so a second session would not be a second model, it would be
 * two callers corrupting one KV cache.
 */
export function needle(options: CreateNeedleOptions = {}) {
  pending ??= createNeedleSession({
    baseUrl: needleBase(),
    system: needleFacts(),
    // Escalate rather than act. The calibration holds that both the confidence
    // head and the decode probability have to agree, so the failure mode below
    // this line is "ask again", not "log the wrong meal".
    minConfidence: 0.6,
    ...options,
  })
  return pending
}

/**
 * Pay the setup cost now.
 *
 * Call it when a screen that will want the model comes into view, not when the
 * user has already typed. On the web and on a cold cache that is a 14 MB
 * download; on a phone the weights are already linked in, so it is the tool
 * grammar and the first prefill, which is small but not free.
 */
export async function warmNeedle() {
  const session = await needle()
  await session.prepare()
  return session
}

/** Tests and the settings screen's "forget the model" button. */
export async function disposeNeedle() {
  const session = await pending
  pending = null
  await session?.dispose()
}
