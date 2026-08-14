import { describe, expect, test } from "bun:test"
import { umamiPlugin } from "./vite.config"

/**
 * The tracker used to be hardcoded in index.html, so every self-hosted install
 * reported to the project's analytics without anyone asking. These tests exist
 * to keep the new default honest: an unconfigured build ships no script, and
 * nothing short of both values being set changes that.
 */
const inject = (
  scriptUrl?: string,
  websiteId?: string,
  recorder = false
): Array<{ attrs?: Record<string, unknown> }> => {
  const plugin = umamiPlugin(scriptUrl, websiteId, recorder)
  const hook = plugin.transformIndexHtml
  const handler = typeof hook === "function" ? hook : hook?.handler
  // @ts-expect-error the hook is called by vite with an html string it ignores
  return handler?.call(null, "") ?? []
}

const SCRIPT = "https://umami.example.com/script.js"
const ID = "8816ef62-95da-4796-b26f-0a003731044c"

describe("Umami tag injection", () => {
  test("injects nothing when unconfigured — the self-hosted default", () => {
    expect(inject(undefined, undefined)).toEqual([])
  })

  test("injects nothing on half a configuration", () => {
    expect(inject(SCRIPT, undefined)).toEqual([])
    expect(inject(undefined, ID)).toEqual([])
    expect(inject("   ", ID)).toEqual([])
    expect(inject(SCRIPT, "  ")).toEqual([])
  })

  test("injects the tracker when both values are set", () => {
    const tags = inject(SCRIPT, ID)
    expect(tags).toHaveLength(1)
    expect(tags[0]?.attrs).toEqual({
      defer: true,
      src: SCRIPT,
      "data-website-id": ID,
    })
  })

  test("leaves the session recorder off unless separately asked for", () => {
    expect(inject(SCRIPT, ID)).toHaveLength(1)
    const withRecorder = inject(SCRIPT, ID, true)
    expect(withRecorder).toHaveLength(2)
    expect(withRecorder[1]?.attrs).toMatchObject({
      src: "https://umami.example.com/recorder.js",
    })
  })

  test("skips the recorder rather than guessing at a non-standard script URL", () => {
    expect(inject("https://analytics.example.com/u.js", ID, true)).toHaveLength(
      1
    )
  })
})
