/**
 * The stack of things a "back" should close before it leaves the screen.
 *
 * On Android the system back gesture goes straight to the WebView's history,
 * so with a sheet open it closed the sheet *and* left the page — one gesture
 * that reads as two. Anything overlaying the page registers here and the
 * platform back handler unwinds the top of the stack first.
 *
 * Deliberately framework-free: this file is imported by shared components and
 * by the native shell, which have no other common ground.
 */
type DismissHandler = () => void

const stack: DismissHandler[] = []

export function pushDismissHandler(handler: DismissHandler) {
  stack.push(handler)
  return () => {
    const index = stack.lastIndexOf(handler)
    if (index !== -1) stack.splice(index, 1)
  }
}

/** True when something was closed, i.e. the back should go no further. */
export function dismissTopmost(): boolean {
  const handler = stack.pop()
  if (!handler) return false
  handler()
  return true
}

export function hasDismissableLayer(): boolean {
  return stack.length > 0
}
