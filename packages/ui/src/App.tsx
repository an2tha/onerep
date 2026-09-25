import { Message, tr } from "@repo/ui/i18n"
import { Button } from "@/components/ui/button"

export function App() {
  return (
    <div className="flex min-h-svh p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <div>
          <h1 className="font-medium">{tr("Project ready!")}</h1>
          <p>{tr("You may now add components and start building.")}</p>
          <p>{tr("We've already added the button component for you.")}</p>
          <Button className="mt-2">{tr("Button")}</Button>
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          <Message
            text={"(Press {{value0}} to toggle dark mode)"}
            values={{ value0: <kbd>{tr("d")}</kbd> }}
          />
        </div>
      </div>
    </div>
  )
}

export default App
