import { Component, type ErrorInfo, type ReactNode } from "react"
import { ArrowCounterClockwise, Warning } from "@phosphor-icons/react"

interface Props {
  children: ReactNode
  /** Optional label shown in the error UI, e.g. "Foods" */
  label?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children

    const label = this.props.label ?? "this page"

    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
          <Warning size={26} weight="fill" className="text-destructive/60" />
        </div>
        <div className="space-y-1">
          <p className="text-[15px] font-semibold">Something went wrong</p>
          <p className="text-[12px] text-muted-foreground/60">
            An unexpected error occurred in {label}. Your data is safe.
          </p>
        </div>
        <button
          onClick={this.reset}
          className="mt-1 flex items-center gap-1.5 rounded-full bg-muted/60 px-4 py-2 text-[13px] font-medium transition-opacity active:opacity-60"
        >
          <ArrowCounterClockwise size={13} weight="bold" />
          Try again
        </button>
        {import.meta.env.DEV && (
          <pre className="mt-4 max-w-full overflow-auto rounded-xl bg-muted/40 p-3 text-left text-[10px] text-muted-foreground/60">
            {this.state.error.message}
          </pre>
        )}
      </div>
    )
  }
}
