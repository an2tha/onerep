// App Store bundles expose version information only. No update plugin,
// manifest fetch, executable download, or activation code is included.
export type OtaState = { phase: "idle" }
export type OtaRollback = { version: string }
const state: OtaState = { phase: "idle" }
export function otaOrigin() {
  return "https://app.onerep.life"
}
export function otaBuildVersion() {
  return import.meta.env.VITE_BUNDLE_VERSION || "0.0.0"
}
export function isOtaSupported() {
  return false
}
export function getOtaState() {
  return state
}
export function subscribeOtaState(callback: (state: OtaState) => void) {
  callback(state)
  return () => {}
}
export async function checkForOtaUpdate(_options: { force?: boolean } = {}) {
  return { action: "skip", reason: "up-to-date" } as const
}
export async function applyOtaUpdateNow() {}
export async function notifyOtaAppReady() {}
export async function initializeOta(
  _options: { onRollback?: (rollback: OtaRollback) => void } = {}
) {
  return () => {}
}
export async function otaDiagnostics() {
  return {
    supported: false,
    enabled: false,
    buildVersion: otaBuildVersion(),
    current: null,
    native: null,
    staged: null,
    blocked: [],
    state,
  }
}
