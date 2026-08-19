import { describe, expect, test } from "bun:test"

const css = await Bun.file(
  new URL("../../../packages/ui/src/index.css", import.meta.url)
).text()
const homeIndex = await Bun.file(
  new URL("../../../packages/ui/src/components/home/index.tsx", import.meta.url)
).text()
const animatedAccordion = await Bun.file(
  new URL(
    "../../../packages/ui/src/components/animated-accordion.tsx",
    import.meta.url
  )
).text()

describe("app motion CSS", () => {
  test("enables the shared motion primitives", () => {
    expect(css).toContain(
      ".motion-page {\n    animation-name: motion-page-settle"
    )
    expect(css).toContain(
      ".motion-card {\n    animation-name: motion-card-settle"
    )
    expect(css).toContain(
      ".motion-item {\n    animation-name: motion-page-settle"
    )
    expect(css).toContain(".motion-pop {\n    animation-name: motion-pop")
    expect(css).toContain(".motion-tactile {\n    transition:")
    expect(css).toContain(".motion-list-row {\n    transition:")
    expect(css).toContain(".motion-success-pop {\n    animation: success-pop")
  })

  test("animates the coach header icon buttons", () => {
    expect(css).toContain(".coach-header-action:active {")
    expect(css).toContain(".coach-header-action--memory:active svg {")
    expect(css).toContain(".coach-header-action--history:active svg {")
    expect(css).toContain(".coach-header-action svg,")
  })

  test("enables the extended motion primitives", () => {
    expect(css).toContain(
      ".motion-empty-state {\n    animation-name: motion-page-settle"
    )
    expect(css).toContain(".motion-checkbox {\n    transition:")
    expect(css).toContain(".motion-row-checked {\n    transition:")
    expect(css).toContain(
      ".motion-bar-fill {\n    transform-origin: left center"
    )
    expect(css).toContain(
      ".motion-ring-progress {\n    transition: stroke-dashoffset"
    )
    expect(css).toContain(
      ".motion-content-in {\n    animation-name: motion-page-settle"
    )
    expect(css).toContain(".motion-tab-icon {")
    expect(css).toContain(".motion-burst {")
    expect(css).toContain("@keyframes motion-check-draw {")
    expect(css).toContain("@keyframes motion-rise-particle {")
    expect(css).toContain("@keyframes motion-tab-icon-pop {")
    expect(css).toContain("@keyframes motion-collapse-out {")
    expect(css).toContain("@keyframes motion-save-confirm {")
  })

  test("registers every new primitive for reduced motion", () => {
    // Sliced rather than searched file-wide: the point is that the selector is
    // inside the override block, not merely present somewhere in the stylesheet.
    // There are several such blocks; the authoritative one is the one holding
    // the shared primitives.
    const anchor = css.indexOf(".motion-page,")
    const start = css.lastIndexOf(
      "@media (prefers-reduced-motion: reduce)",
      anchor
    )
    const reduced = css.slice(start, css.indexOf("}\n}", anchor))

    for (const selector of [
      ".motion-empty-state,",
      ".motion-stagger,",
      ".motion-checkbox,",
      ".motion-row-checked,",
      ".motion-burst,",
      ".motion-tab-icon,",
      ".motion-ring-progress,",
      ".motion-ring-complete,",
      ".motion-bar-fill,",
      ".motion-content-in,",
      ".motion-collapse-out,",
      ".motion-save-confirm,",
      ".native-primary-button,",
      ".native-secondary-button,",
      ".native-toolbar-button,",
      "button.native-list-row,",
    ]) {
      expect(reduced).toContain(selector)
    }
  })

  test("removes particle bursts entirely under reduced motion", () => {
    // Disabling the animation alone would park the particles on screen.
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.motion-burst,\n\s*\.water-rain \{\n\s*display: none !important;/
    )
  })

  test("keeps progress surfaces free of inline transitions", () => {
    // An inline style on an unclassed element cannot be reached by the
    // reduced-motion block, which is how the calorie ring escaped it.
    expect(homeIndex).not.toMatch(/style=\{\{[^}]*transition:/s)
  })

  test("keeps reduced-motion overrides authoritative", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)")
    expect(css).toContain(".motion-tactile,")
    expect(css).toContain(".motion-list-row,")
    expect(css).toContain("animation: none !important;")
    expect(css).toContain("transition: none !important;")
  })

  test("animates all accordion disclosures without scale motion", () => {
    // Height is measured rather than expressed as `0fr -> 1fr`, which WebKit
    // will not interpolate — that is the whole reason these drawers snapped.
    expect(animatedAccordion).toContain("accordion-drawer-animated")
    expect(animatedAccordion).toContain("height: open ? bodyHeight : 0")
    expect(css).toContain(".accordion-drawer-animated {")
    expect(animatedAccordion).toContain('open && "rotate-180"')
    expect(css).toContain(
      "animation: accordion-down var(--motion-medium) var(--motion-ease-standard)"
    )
  })
})
