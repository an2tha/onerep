import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ActiveRouteOnly, RouteActivityContext } from "../route-activity"

describe("workout ownership during route transitions", () => {
  test("the current route renders the session", () => {
    expect(renderToStaticMarkup(
      <ActiveRouteOnly><p>Workout session</p></ActiveRouteOnly>
    )).toBe("<p>Workout session</p>")
  })

  test("the outgoing copy cannot initialize a session or recovery prompt", () => {
    function SessionThatMustNotMount() {
      throw new Error("Outgoing route initialized a workout")
    }
    expect(renderToStaticMarkup(
      <RouteActivityContext.Provider value={false}>
        <ActiveRouteOnly><SessionThatMustNotMount /></ActiveRouteOnly>
      </RouteActivityContext.Provider>
    )).toBe("")
  })

  test("only the live session renders while the outgoing outlet is retained", () => {
    const initialized: string[] = []
    function Session({ id }: { id: string }) {
      initialized.push(id)
      return <p>{id}</p>
    }
    const html = renderToStaticMarkup(
      <>
        <RouteActivityContext.Provider value={false}>
          <ActiveRouteOnly><Session id="aborted" /></ActiveRouteOnly>
        </RouteActivityContext.Provider>
        <ActiveRouteOnly><Session id="new" /></ActiveRouteOnly>
      </>
    )
    expect(initialized).toEqual(["new"])
    expect(html).toBe("<p>new</p>")
  })
})
