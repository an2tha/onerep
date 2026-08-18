/**
 * Bridge to the native iOS floating tab bar (NativeTabBarPlugin.swift).
 *
 * The web app remains the router: the native bar only reports taps and
 * mirrors selection/visibility pushed from here. On Android, the web, and on
 * iOS binaries that pre-date the plugin (OTA-updated JS inside an old shell),
 * `useNativeTabBar` reports unsupported and the web bar renders as before.
 */

import { useEffect, useMemo, useRef } from "react"
import { Capacitor, registerPlugin } from "@capacitor/core"
import type { PluginListenerHandle } from "@capacitor/core"
import { logDevWarn } from "@/lib/utils"
import { activeTabPath, isTabActive } from "@/components/bottom-bar"

type NativeTabBarItem = {
  id: string
  /** SF Symbol name. */
  symbol: string
  label: string
  prominent?: boolean
}

type NativeTabBarPlugin = {
  configure(options: {
    items: NativeTabBarItem[]
    selectedId: string
  }): Promise<void>
  setSelected(options: { id: string }): Promise<void>
  setVisible(options: { visible: boolean }): Promise<void>
  setAppearance(options: { style: "light" | "dark" | "system" }): Promise<void>
  addListener(
    event: "tabSelected",
    callback: (data: { id: string }) => void
  ): Promise<PluginListenerHandle>
}

const nativeTabBar = registerPlugin<NativeTabBarPlugin>("NativeTabBar")

/** Ids are the web routes, so a tap event is already a navigation target. */
const NATIVE_TAB_ITEMS: NativeTabBarItem[] = [
  { id: "/", symbol: "house", label: "Today" },
  { id: "/nutrition", symbol: "fork.knife", label: "Nutrition" },
  { id: "/workouts", symbol: "dumbbell", label: "Training" },
  { id: "/progress", symbol: "chart.bar", label: "Progress" },
  { id: "/health", symbol: "heart.text.square", label: "Health" },
  { id: "/coach", symbol: "sparkles", label: "Coach", prominent: true },
]

export function isNativeTabBarSupported(): boolean {
  return (
    Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("NativeTabBar")
  )
}

/**
 * Drives the native bar from React state. Returns whether the native bar is
 * in charge — when true, the caller must not render the web tab bar.
 */
export function useNativeTabBar({
  pathname,
  visible,
  onSelect,
}: {
  pathname: string
  visible: boolean
  onSelect: (path: string) => void
}): boolean {
  const supported = useMemo(() => isNativeTabBarSupported(), [])
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // Build the bar once and subscribe to taps.
  const initialSelectionRef = useRef(activeTabPath(pathname) ?? "")
  useEffect(() => {
    if (!supported) return
    let handle: PluginListenerHandle | undefined
    let disposed = false
    void nativeTabBar
      .configure({
        items: NATIVE_TAB_ITEMS,
        selectedId: initialSelectionRef.current,
      })
      .catch((error) => logDevWarn("Native tab bar configure failed", error))
    void nativeTabBar
      .addListener("tabSelected", ({ id }) => onSelectRef.current(id))
      .then((h) => {
        if (disposed) void h.remove()
        else handle = h
      })
    return () => {
      disposed = true
      void handle?.remove()
    }
  }, [supported])

  // Mirror route changes into the bar (covers back gestures and deep links,
  // which never pass through a tab tap).
  useEffect(() => {
    if (!supported) return
    void nativeTabBar
      .setSelected({ id: activeTabPath(pathname) ?? "" })
      .catch(() => undefined)
  }, [supported, pathname])

  useEffect(() => {
    if (!supported) return
    void nativeTabBar.setVisible({ visible }).catch(() => undefined)
  }, [supported, visible])

  // Coach paints its own dark backdrop in either theme, so the bar has to be
  // told to stay dark there or its icons turn black on a black gradient.
  useEffect(() => {
    if (!supported) return
    void nativeTabBar
      .setAppearance({
        style: isTabActive(pathname, "/coach") ? "dark" : "system",
      })
      .catch(() => undefined)
  }, [supported, pathname])

  return supported
}
