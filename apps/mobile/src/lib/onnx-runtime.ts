import { Capacitor } from "@capacitor/core"
import * as ort from "onnxruntime-web/wasm"
import { otaOrigin } from "@/lib/ota"

/**
 * Shared onnxruntime-web setup for the two models pose estimation runs.
 *
 * Both the detector and the lifter load through here so they agree on where the
 * wasm comes from, how many threads they may use, and how a session is cached.
 */

/**
 * The wasm binaries, from a CDN and version-matched to the installed package.
 *
 * `env.versions.web` is read rather than hard-coded so a dependency bump cannot
 * leave the JS talking to a mismatched runtime — the failure mode there is a
 * corrupt-looking model load with no useful message.
 */
const WASM_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`

/**
 * Where the two .onnx files are served from.
 *
 * On native this has to be an absolute origin. The models live outside the OTA
 * bundle — far too big to ship in every update — and a root-relative path
 * resolves inside whatever bundle directory Capgo has swapped in, so it 404s
 * after the first update. `otaOrigin` is already the app's answer to "which
 * origin serves the things updates do not replace", so it answers this too.
 *
 * On the web it must NOT be. The same origin already serves `public/models`,
 * both under Vite in development and from the Pages deploy in production, so a
 * root-relative path is right there and costs no CORS. Pointing the browser at
 * the production origin instead fails in the least helpful way available: Pages
 * answers an unknown path with the SPA shell, so the fetch succeeds with a
 * 200, and the runtime reports a protobuf parse error for what is really an
 * HTML page.
 */
function modelBase() {
  return Capacitor.isNativePlatform() ? `${otaOrigin()}/models` : "/models"
}

export function modelUrl(file: string) {
  return `${modelBase()}/${file}`
}

let configured = false

function configure() {
  if (configured) return
  ort.env.wasm.wasmPaths = WASM_BASE
  // Cross-origin isolation is not guaranteed in the Capacitor WebView, and
  // without it SharedArrayBuffer is unavailable and multi-threading silently
  // fails to start. Asking for one thread makes that the intended behaviour
  // rather than a fallback, and SIMD carries the performance.
  ort.env.wasm.numThreads = 1
  ort.env.wasm.simd = true
  // Warnings only. The runtime is chatty at info level, once per session per
  // model, and none of it is actionable from here.
  ort.env.logLevel = "warning"
  configured = true
}

const sessions = new Map<string, Promise<ort.InferenceSession>>()

/**
 * A cached inference session for `file`.
 *
 * Cached because both models are megabytes and slow to compile, and one
 * analysis runs several angles through them back to back. Loading a session
 * that then fails leaves nothing behind, so the next attempt genuinely retries
 * rather than replaying a rejected promise forever.
 */
export function loadSession(file: string): Promise<ort.InferenceSession> {
  configure()
  let pending = sessions.get(file)
  if (!pending) {
    pending = fetchModel(file)
      .then((bytes) =>
        ort.InferenceSession.create(bytes, {
          executionProviders: ["wasm"],
          graphOptimizationLevel: "all",
        })
      )
      .catch((error: unknown) => {
        sessions.delete(file)
        throw error
      })
    sessions.set(file, pending)
  }
  return pending
}

/** The first bytes of any ONNX file: field 1 (ir_version) as a varint. */
const ONNX_MAGIC = 0x08

/**
 * The model as bytes, fetched here rather than by handing the runtime a URL.
 *
 * The runtime would fetch it perfectly well on its own. What it would not do is
 * notice that the server answered with something other than a model — a Pages
 * SPA fallback and a Vite dev-server miss both return 200 with an HTML body —
 * and the error it raises for that is "protobuf parsing failed", which sends you
 * looking for a corrupt export rather than a wrong URL. Checking here turns the
 * common misconfiguration into a message that names it.
 */
async function fetchModel(file: string) {
  const url = modelUrl(file)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Could not fetch the pose model at ${url} (${response.status})`
    )
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes[0] !== ONNX_MAGIC) {
    const type = response.headers.get("content-type") ?? "unknown"
    throw new Error(
      `${url} did not return a model (${type}, ${bytes.length} bytes). ` +
        "Has public/models been built and deployed to this origin?"
    )
  }
  return bytes
}

/** Drops every cached session and the memory its weights hold. */
export async function releaseSessions() {
  const pending = [...sessions.values()]
  sessions.clear()
  for (const session of pending) {
    await session.then(
      (instance) => instance.release(),
      // A session that never loaded has nothing to release, and its failure was
      // already surfaced to whoever awaited the inference.
      () => {}
    )
  }
}
