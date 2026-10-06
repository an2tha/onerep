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
      expect(markup).not.toContain("aria-checked")
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
