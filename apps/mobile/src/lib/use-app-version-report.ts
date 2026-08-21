import { useEffect, useRef } from "react"
import { useMutation } from "convex/react"
import { Capacitor } from "@capacitor/core"
import { App as CapacitorApp } from "@capacitor/app"
import { api } from "../../../../convex/_generated/api"
import { otaDiagnostics } from "@/lib/ota"
import { loadBuildInfo } from "@/lib/build-info"

/**
 * Tells the server what build this device is actually running.
 *
 * A bug report is only as good as the build behind it. Without this, "the OTA
 * didn't fix it" and "the OTA never reached them" look identical from here,
 * and the only way to tell was to ask the reporter to read a version number
 * off a settings screen.
 *
 * Fire-and-forget: a failure here must never surface to the user or block a
 * launch, and it is written once per changed build rather than per render.
 */
export function useAppVersionReport(enabled: boolean) {
  const recordAppVersion = useMutation(api.users.users.recordAppVersion)
  const reported = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    void (async () => {
      try {
        const [diagnostics, build] = await Promise.all([
          otaDiagnostics(),
          loadBuildInfo(),
        ])

        let appVersion = diagnostics.buildVersion || build?.version || "unknown"
        if (Capacitor.isNativePlatform()) {
          try {
            const info = await CapacitorApp.getInfo()
            appVersion = `${info.version} (${info.build})`
          } catch {
            // An older shell that cannot answer; the bundle below still says
            // what code is running, which is the part that changes on OTA.
          }
        }

        // The active web bundle: what an OTA release actually swaps.
        const bundleVersion = diagnostics.current ?? build?.version ?? undefined
        const platform = Capacitor.getPlatform()
        const signature = `${appVersion}|${bundleVersion ?? ""}|${platform}`
        if (cancelled || reported.current === signature) return
        reported.current = signature

        await recordAppVersion({ appVersion, bundleVersion, platform })
      } catch {
        // Telemetry is never worth a broken launch.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, recordAppVersion])
}
