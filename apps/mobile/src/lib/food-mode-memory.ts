/**
 * Remembers the food drawer's last logging mode, so a person who always
 * snaps their plate stops paying a dial turn to get back to the camera, and
 * a repeat-logger lands straight on their usuals.
 *
 * Local-only, same as the FAB position: a UI convenience, not a signal.
 */

import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"

const MODE_KEY = "onerep:food-mode"

export type FoodDrawerMode = "snap" | "repeat" | "search"

const MODES: FoodDrawerMode[] = ["snap", "repeat", "search"]

export function readLastFoodMode(): FoodDrawerMode {
  const raw = safeLocalStorageGet(MODE_KEY)
  return MODES.includes(raw as FoodDrawerMode) ? (raw as FoodDrawerMode) : "repeat"
}

export function rememberFoodMode(mode: FoodDrawerMode): void {
  safeLocalStorageSet(MODE_KEY, mode)
}
