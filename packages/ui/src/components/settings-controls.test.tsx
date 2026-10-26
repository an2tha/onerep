import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CompactSwitch } from "./settings-controls"

describe("CompactSwitch accessibility", () => {
  test("exposes its on and off states through a native checkbox", () => {
    for (const checked of [true, false]) {
      const markup = renderToStaticMarkup(
        <CompactSwitch
          checked={checked}
          onChange={() => {}}
          label="Simple dashboard"
        />
      )

      expect(markup).toContain('type="checkbox"')
      expect(markup).toContain('role="switch"')
      expect(markup).toContain('aria-label="Simple dashboard"')
      expect(markup.includes('checked=""')).toBe(checked)
      // `role="switch"` is not the checkbox mapping, so the state has to be
      // stated in ARIA as well as in the DOM, and the two must agree. Android's
      // WebView exposes neither (verified on device), which is why no screen may
      // read its own switch for an answer — see health-write-access.ts.
      expect(markup).toContain(`aria-checked="${checked}"`)
    }
  })

  test("preserves the disabled state and renders display-only switches without an input", () => {
    const disabled = renderToStaticMarkup(
      <CompactSwitch
        checked
        onChange={() => {}}
        disabled
        label="Simple dashboard"
      />
    )
    const displayOnly = renderToStaticMarkup(<CompactSwitch checked />)

    expect(disabled).toContain('disabled=""')
    expect(displayOnly).not.toContain("<input")
    expect(displayOnly).toContain('aria-hidden="true"')
  })
})
