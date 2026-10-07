import { MemoryRouter } from "react-router"
import { expect, mock, test } from "bun:test"
import { Window } from "happy-dom"
import { act } from "react"
import type { ReactNode } from "react"
import { NumberQuestion } from "@repo/ui/components/onboarding-controls"
import { DashboardDials } from "../../src/dashboard/dials"
import { renderToStaticMarkup } from "react-dom/server"
mock.module("@/components/mobile-sheet", () => ({
  MobileSheet: ({ children }: { children: ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
}))
const { EntrySheet } = await import("../../src/dashboard/entry-sheet")
const { StartWorkoutDial } =
  await import("../../src/components/training-hero-dials")
const { GoalsHubView } = await import("../../src/components/goals-hub")
const window = new Window({ url: "http://localhost" })
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "CustomEvent",
] as const)
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? window : window[key],
    configurable: true,
    writable: true,
  })
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Object.assign(globalThis, {
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
})
const { createRoot } = await import("react-dom/client")
const mount = () => {
  const container = document.createElement("div")
  document.body.append(container)
  return { container, root: createRoot(container) }
}

test("empty measurements require input, invalid values survive blur, and corrections recover", async () => {
  const { container, root } = mount()
  let valid = false
  let saved = 75
  await act(async () =>
    root.render(
      <NumberQuestion
        label="Weight (kg)"
        value={75}
        display="75 kg"
        min={35}
        max={250}
        empty
        onChange={(value) => {
          saved = value
        }}
        onValidityChange={(value) => {
          valid = value
        }}
      />
    )
  )
  const input = container.querySelector("input")!
  expect(input.value).toBe("")
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, "30")
    input.dispatchEvent(new window.Event("input", { bubbles: true }))
  })
  await act(async () => {
    input.focus()
    input.blur()
  })
  expect(input.value).toBe("30")
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("35")
  expect(valid).toBe(false)
  expect(saved).toBe(75)
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, "80")
    input.dispatchEvent(new window.Event("input", { bubbles: true }))
  })
  await act(async () => {
    input.focus()
    input.blur()
  })
  expect(valid).toBe(true)
  expect(saved).toBe(80)
  await act(async () => root.unmount())
})

test("entry saves keep draft and retry after rejection; pending saves block duplicates", async () => {
  const { container, root } = mount()
  let release: (() => void) | undefined
  let fail = true
  let calls = 0
  let closed = false
  const selected = {
    entry: {
      id: "water:one",
      kind: "water" as const,
      title: "Water",
      time: "10:30",
      detail: "250 ml",
    },
    date: "2026-09-30",
    amount: 250,
    unit: "ml",
  }
  await act(async () =>
    root.render(
      <EntrySheet
        selection={selected}
        onClose={() => {
          closed = true
        }}
        onDelete={async () => {}}
        onSave={async () => {
          calls++
          await new Promise<void>((resolve) => {
            release = resolve
          })
          if (fail) throw new Error("Rejected. Try again.")
        }}
      />
    )
  )
  const save = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Save changes"
  )!
  await act(async () => {
    save.click()
    save.click()
  })
  expect(calls).toBe(1)
  expect(save.disabled).toBe(true)
  await act(async () => release?.())
  expect(closed).toBe(false)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Try again"
  )
  expect(
    container.querySelector('input[type="time"]')?.getAttribute("value")
  ).toBe("10:30")
  fail = false
  await act(async () => save.click())
  await act(async () => release?.())
  expect(closed).toBe(true)
  await act(async () => root.unmount())
})

test("workout start responds to an ordinary click", async () => {
  const { container, root } = mount()
  let started = 0
  await act(async () =>
    root.render(
      <StartWorkoutDial
        label="Start workout"
        size={168}
        stroke={9}
        color="black"
        onComplete={() => {
          started++
        }}
      />
    )
  )
  await act(async () => container.querySelector("button")!.click())
  expect(started).toBe(1)
  expect(container.textContent).toContain("Start workout")
  await act(async () => root.unmount())
})

test("first goal viewing stays optional and saving requires a deliberate focus", async () => {
  const { container, root } = mount()
  const saves: unknown[] = []
  await act(async () =>
    root.render(
      <MemoryRouter><GoalsHubView
        preferences={{}}
        today="2026-10-07"
        save={async (args) => {
          saves.push(args)
        }}
      /></MemoryRouter>
    )
  )
  expect(container.querySelector('[role="dialog"]')).toBeNull()
  await act(async () => container.querySelector("button")!.click())
  const save = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Save goal"
  )!
  expect(container.querySelectorAll("input:checked").length).toBe(0)
  expect(save.disabled).toBe(true)
  await act(async () =>
    container.querySelector<HTMLInputElement>('input[type="radio"]')!.click()
  )
  expect(save.disabled).toBe(false)
  await act(async () => save.click())
  expect(saves).toEqual([{ plan: { focus: "hypertrophy" } }])
  await act(async () => root.unmount())
})

test("dashboard separates loading, measured zero, unavailable readings, and habit logging", () => {
  const readings = (
    value: number | null,
    loading = false,
    showNutritionMetric = true
  ) =>
    renderToStaticMarkup(
      <DashboardDials
        nutritionPercent={value}
        recoveryStatus={null}
        loading={loading}
        showNutritionMetric={showNutritionMetric}
        onStartWorkout={() => {}}
      />
    )
  expect(readings(null, true)).toContain("Loading")
  expect(readings(0)).toContain("0%")
  expect(readings(null)).toContain("No reading")
  expect(readings(null, false, false)).toContain("Food diary")
  expect(readings(null, false, false)).not.toContain("Daily energy")
})
