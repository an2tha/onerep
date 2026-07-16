import { describe, expect, test } from "bun:test"

const css = await Bun.file(
  new URL("../../../packages/ui/src/index.css", import.meta.url)
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

  test("keeps reduced-motion overrides authoritative", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)")
    expect(css).toContain(".motion-tactile,")
    expect(css).toContain(".motion-list-row,")
    expect(css).toContain("animation: none !important;")
    expect(css).toContain("transition: none !important;")
  })

  test("animates all accordion disclosures without scale motion", () => {
    expect(animatedAccordion).toContain("grid-rows-[1fr] opacity-100")
    expect(animatedAccordion).toContain("grid-rows-[0fr] opacity-0")
    expect(animatedAccordion).toContain("motion-reduce:transition-none")
    expect(animatedAccordion).toContain('open && "rotate-180"')
    expect(css).toContain(
      "animation: accordion-down var(--motion-medium) var(--motion-ease-standard)"
    )
  })
})
