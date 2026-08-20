import * as React from "react"

/**
 * Backdrop-click dismissal that a re-render cannot trigger by accident.
 *
 * A plain `onClick={onClose}` on the overlay is wrong whenever the sheet's
 * own content changes shape under the finger. The browser fires `click` on
 * the nearest common ancestor of press and release, so a button that
 * disappears mid-tap — a bar type that reveals a plate row, a list item that
 * re-sorts — retargets the click to the backdrop and closes the sheet the
 * user was in the middle of using.
 *
 * Requiring the press *and* the release to land on the overlay itself keeps
 * tap-outside-to-close working and makes that class of accident impossible.
 */
export function useBackdropDismiss(onDismiss: () => void) {
  const pressedOnBackdrop = React.useRef(false)

  return {
    onPointerDown: (event: React.PointerEvent) => {
      pressedOnBackdrop.current = event.target === event.currentTarget
    },
    onClick: (event: React.MouseEvent) => {
      if (event.target !== event.currentTarget) return
      if (!pressedOnBackdrop.current) return
      pressedOnBackdrop.current = false
      onDismiss()
    },
  }
}
