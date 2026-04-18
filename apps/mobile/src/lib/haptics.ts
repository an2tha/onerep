import { Capacitor } from "@capacitor/core"
import { Haptics, ImpactStyle } from "@capacitor/haptics"

function canHaptic() {
  return Capacitor.isNativePlatform()
}

export async function hapticTap() {
  if (!canHaptic()) return
  try {
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch {}
}

export async function hapticMedium() {
  if (!canHaptic()) return
  try {
    await Haptics.impact({ style: ImpactStyle.Medium })
  } catch {}
}

export async function hapticHeavy() {
  if (!canHaptic()) return
  try {
    await Haptics.impact({ style: ImpactStyle.Heavy })
  } catch {}
}

export async function hapticSelection() {
  if (!canHaptic()) return
  try {
    await Haptics.selectionChanged()
  } catch {}
}
