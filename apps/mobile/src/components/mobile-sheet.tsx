import { MobileSheet as MobileSheetView, type MobileSheetProps } from "@repo/ui"
import { hapticSelection, hapticTap } from "@/lib/haptics"

export function MobileSheet(props: MobileSheetProps) {
  return (
    <MobileSheetView
      {...props}
      onDragStart={props.onDragStart ?? hapticTap}
      onDismissGesture={props.onDismissGesture ?? hapticSelection}
    />
  )
}

export type { MobileSheetProps }
