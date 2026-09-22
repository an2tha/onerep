import {
  Component,
  useCallback,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { Renderer, type ActionEvent } from "@openuidev/react-lang"
import { ThemeProvider } from "@openuidev/react-ui"
import {
  CoachOpenUIContext,
  coachOpenUILibrary,
  type CoachOpenUIActions,
} from "./coach-openui-library"
import type { CoachUiAction } from "./coach-chat"
import "@openuidev/react-ui/components.css"
import "./coach-openui.css"

const navigationActions = new Set<CoachUiAction>([
  "open_nutrition",
  "open_workouts",
  "open_progress",
  "open_settings",
  "open_workout_builder",
  "open_recipe_builder",
  "open_supplements",
  "log_food",
])

export function handleCoachOpenUIAction(
  event: ActionEvent,
  actions: CoachOpenUIActions,
) {
  if (navigationActions.has(event.type as CoachUiAction)) {
    actions.onAction(event.type as CoachUiAction)
  } else if (event.type === "continue_conversation") {
    const context =
      typeof event.params.context === "string" ? event.params.context : ""
    const fields =
      event.formState && Object.keys(event.formState).length
        ? `\nForm values: ${JSON.stringify(event.formState)}`
        : ""
    const message =
      [event.humanFriendlyMessage, context].filter(Boolean).join("\n") + fields
    if (message.trim()) actions.onContinue(message.slice(0, 4000))
  }
}

const fallback = (
  <p role="status" className="mt-3 text-sm text-muted-foreground">
    This interface couldn’t be displayed. Ask Coach to try again.
  </p>
)
class OpenUIBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? fallback : this.props.children
  }
}

const theme = {
  background: "var(--background)",
  foreground: "var(--foreground)",
  textNeutralPrimary: "var(--foreground)",
  textNeutralSecondary: "var(--muted-foreground)",
  textNeutralTertiary: "var(--muted-foreground)",
  elevated: "var(--background)",
  elevatedLight: "var(--background)",
  sunk: "var(--muted)",
  sunkLight: "var(--muted)",
  popoverBackground: "var(--popover)",
  borderDefault: "var(--border)",
  borderInteractive: "var(--border)",
  interactiveAccentDefault: "var(--primary)",
  textAccentPrimary: "var(--primary-foreground)",
  fontBody: "var(--font-sans)",
  fontHeading: "var(--font-sans)",
  fontLabel: "var(--font-sans)",
  fontNumbers: "var(--font-sans)",
}

function subscribeToAppearance(listener: () => void) {
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  })
  return () => observer.disconnect()
}
const currentAppearance = () =>
  document.documentElement.classList.contains("dark")

export default function CoachOpenUI({
  source,
  ...actions
}: CoachOpenUIActions & { source: string }) {
  const dark = useSyncExternalStore(
    subscribeToAppearance,
    currentAppearance,
    () => false,
  )
  const [failed, setFailed] = useState(false)
  const onError = useCallback(
    (errors: unknown[]) => setFailed(errors.length > 0),
    [],
  )
  return (
    <CoachOpenUIContext.Provider value={actions}>
      <ThemeProvider
        mode={dark ? "dark" : "light"}
        lightTheme={theme}
        darkTheme={theme}
        cssSelector=".coach-openui"
      >
        <div className="coach-openui mt-5 min-w-0 max-w-full overflow-x-auto text-sm">
          <OpenUIBoundary key={source}>
            <Renderer
              response={source}
              library={coachOpenUILibrary}
              isStreaming={false}
              onAction={(event) => handleCoachOpenUIAction(event, actions)}
              onError={onError}
            />
          </OpenUIBoundary>
          {failed && fallback}
        </div>
      </ThemeProvider>
    </CoachOpenUIContext.Provider>
  )
}
