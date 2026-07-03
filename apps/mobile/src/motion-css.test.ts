import { describe, expect, test } from "bun:test"

const css = await Bun.file(new URL("./index.css", import.meta.url)).text()

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
  })

  test("keeps reduced-motion overrides authoritative", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)")
    expect(css).toContain("animation: none !important;")
    expect(css).toContain("transition: none !important;")
  })
})
