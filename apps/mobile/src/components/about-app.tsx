import { tr, translateError } from "@repo/ui/i18n"
import { useCallback, useEffect, useRef, useState } from "react"
import { Capacitor } from "@capacitor/core"
import { App as CapacitorApp } from "@capacitor/app"
import { GroupedList, ListRow, toast } from "@repo/ui"
import {
  applyOtaUpdateNow,
  checkForOtaUpdate,
  getOtaState,
  isOtaSupported,
  otaDiagnostics,
  subscribeOtaState,
} from "@/lib/ota"
import { copyTextToClipboard } from "@/lib/error-diagnostics"
import {
  formatBuiltAt,
  isStampedVersion,
  loadBuildInfo,
  shortCommit,
  type BuildInfo,
} from "@/lib/build-info"
import { withReadTimeout } from "@/lib/async-read"
import { hapticTap } from "@/lib/haptics"

/**
 * What is actually installed, and whether it is current.
 *
 * OneRep updates two ways — a store build and an over-the-air web bundle —
 * and neither was visible anywhere in the app. Someone who installed an
 * update and saw no change had no way to tell whether it had arrived, which
 * is how you end up reinstalling from scratch to find out.
 */
type AboutInfo = {
  appVersion: string
  appBuild: string
  bundle: string
  native: string | null
  staged: string | null
  build: BuildInfo | null
}

function versionLine(info: AboutInfo | null) {
  if (!info) return tr("Reading…")
  // Never show 0.0.0. A build nobody stamped is a development build, and
  // saying so is more use than a version number that names nothing.
  if (!isStampedVersion(info.appVersion)) {
    return shortCommit(info.build?.commit) || tr("Development")
  }
  if (!info.appBuild) return info.appVersion
  return `${info.appVersion} (${info.appBuild})`
}

function buildLine(info: AboutInfo | null) {
  const parts = [
    shortCommit(info?.build?.commit),
    formatBuiltAt(info?.build?.builtAt),
  ].filter(Boolean)
  return parts.join(" · ")
}

export function AboutApp() {
  const [info, setInfo] = useState<AboutInfo | null>(null)
  const [otaState, setOtaState] = useState(getOtaState)
  const [checking, setChecking] = useState(false)

  const loadSequence = useRef(0)

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    const [diagnostics, build, app] = await Promise.all([
      otaDiagnostics(),
      withReadTimeout(loadBuildInfo()).catch(() => null),
      Capacitor.isNativePlatform()
        ? withReadTimeout(CapacitorApp.getInfo()).catch(() => null)
        : Promise.resolve(null),
    ])
    // The env stamp is absent outside release builds; version.json is the
    // fallback, and neither existing means a dev build.
    let appVersion = isStampedVersion(diagnostics.buildVersion)
      ? diagnostics.buildVersion
      : (build?.version ?? diagnostics.buildVersion)
    let appBuild = ""
    if (Capacitor.isNativePlatform()) {
      appVersion = app?.version ?? diagnostics.native ?? tr("Unavailable")
      appBuild = app?.build ?? ""
    }
    const bundle =
      (diagnostics.current === "builtin" ? null : diagnostics.current) ??
      (isStampedVersion(diagnostics.buildVersion)
        ? diagnostics.buildVersion
        : (build?.version ?? diagnostics.buildVersion))
    if (sequence !== loadSequence.current) return
    setInfo({
      appVersion,
      appBuild,
      // The active web bundle, which is what an OTA release actually changes.
      bundle: isStampedVersion(bundle)
        ? bundle
        : shortCommit(build?.commit) || "Development",
      native: diagnostics.native,
      staged: diagnostics.staged,
      build,
    })
  }, [])

  useEffect(() => {
    let first = true
    const unsubscribe = subscribeOtaState((next) => {
      setOtaState(next)
      // Always load on mount, including when a download is already running.
      if (first || next.phase !== "downloading") void load()
      first = false
    })
    return () => {
      unsubscribe()
      loadSequence.current++
    }
  }, [load])

  async function handleCheck() {
    if (checking) return
    setChecking(true)
    hapticTap()
    try {
      const decision = await checkForOtaUpdate({ force: true })
      const result = getOtaState()
      if (result.phase === "error") {
        toast.error(translateError(tr("Download failed")))
      } else if (decision.action === "download") {
        toast.success(tr("A OneRep update is ready"))
      } else if (decision.reason === "in-progress") {
        toast.message(tr("Checking…"))
      } else if (decision.reason === "already-staged") {
        toast.success(tr("An update is already waiting"))
      } else if (decision.reason === "invalid-manifest") {
        toast.error(translateError(tr("Could not reach the update server")))
      } else {
        toast.success(tr("You are on the latest version"))
      }
    } finally {
      setChecking(false)
      void load()
    }
  }

  const staged =
    otaState.phase === "ready" ? otaState.version : (info?.staged ?? null)

  const busy =
    checking ||
    otaState.phase === "checking" ||
    otaState.phase === "downloading" ||
    otaState.phase === "applying"

  return (
    <>
      <GroupedList label={tr("About OneRep")}>
        <ListRow
          title={tr("App version")}
          detail={
            Capacitor.isNativePlatform()
              ? tr("The build installed from the store")
              : tr("This web build")
          }
          value={versionLine(info)}
          onClick={() => {
            if (!info) return
            void copyTextToClipboard(
              [
                `OneRep ${versionLine(info)}`,
                tr("bundle {{value0}}", { value0: info.bundle }),
                info.native
                  ? tr("shell {{value0}}", { value0: info.native })
                  : "",
                buildLine(info),
                Capacitor.getPlatform(),
              ]
                .filter(Boolean)
                .join(" · ")
            ).then((copied) => {
              if (copied) toast.success(tr("Version details copied"))
            })
          }}
        />
        {isOtaSupported() && (
          <ListRow
            title={tr("Web bundle")}
            detail={tr("Updates land here without a store release")}
            value={info?.bundle ?? "…"}
          />
        )}
        {buildLine(info) && (
          <ListRow
            title={tr("Build")}
            detail={tr("The exact code this bundle was built from")}
            value={buildLine(info)}
          />
        )}
        {staged && (
          <ListRow
            title={tr("Update ready")}
            detail={tr(
              "Version {{value0}} installs the next time OneRep restarts",
              { value0: staged }
            )}
            value={tr("Restart")}
            onClick={() => void applyOtaUpdateNow()}
          />
        )}
      </GroupedList>

      {isOtaSupported() && (
        <div className="px-[var(--app-page-x)] pt-4">
          <button
            type="button"
            onClick={() => void handleCheck()}
            disabled={busy}
            className="native-secondary-button min-h-12 w-full rounded-[0.8rem] disabled:opacity-40"
          >
            {otaState.phase === "downloading"
              ? tr("Update {{value0}} is downloading", {
                  value0: otaState.version,
                })
              : busy
                ? tr("Checking…")
                : tr("Check for updates")}
          </button>
          <p className="native-row-detail pt-3">
            {tr(
              "Updates apply on the next launch. Reinstalling is never needed."
            )}
          </p>
        </div>
      )}
    </>
  )
}
