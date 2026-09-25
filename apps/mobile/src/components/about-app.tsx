import { tr, translateError } from "@repo/ui/i18n"
import { useCallback, useEffect, useState } from "react"
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

  const load = useCallback(async () => {
    const [diagnostics, build] = await Promise.all([
      otaDiagnostics(),
      loadBuildInfo(),
    ])
    // The env stamp is absent outside release builds; version.json is the
    // fallback, and neither existing means a dev build.
    let appVersion = isStampedVersion(diagnostics.buildVersion)
      ? diagnostics.buildVersion
      : (build?.version ?? diagnostics.buildVersion)
    let appBuild = ""
    if (Capacitor.isNativePlatform()) {
      try {
        const app = await CapacitorApp.getInfo()
        appVersion = app.version
        appBuild = app.build
      } catch {
        // Web build, or a shell too old to answer. The bundle version below
        // is still the honest answer to "what am I running".
      }
    }
    const bundle =
      diagnostics.current ??
      (isStampedVersion(diagnostics.buildVersion)
        ? diagnostics.buildVersion
        : (build?.version ?? diagnostics.buildVersion))
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
    void load()
    return subscribeOtaState((next) => {
      setOtaState(next)
      void load()
    })
  }, [load])

  async function handleCheck() {
    if (checking) return
    setChecking(true)
    hapticTap()
    try {
      const decision = await checkForOtaUpdate({ force: true })
      if (decision.action === "download") {
        toast.success(
          tr("Update {{value0}} is downloading", { value0: decision.version })
        )
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
            value="Restart"
            onClick={() => void applyOtaUpdateNow()}
          />
        )}
      </GroupedList>

      {isOtaSupported() && (
        <div className="px-[var(--app-page-x)] pt-4">
          <button
            type="button"
            onClick={() => void handleCheck()}
            disabled={checking}
            className="native-secondary-button min-h-12 w-full rounded-[0.8rem] disabled:opacity-40"
          >
            {checking ? tr("Checking…") : tr("Check for updates")}
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
