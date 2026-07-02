import { Component, type ErrorInfo, type ReactNode } from "react"
import { useAuth, useClerk } from "@clerk/react"
import { ArrowCounterClockwise, Copy, Warning } from "@phosphor-icons/react"
import {
  handleUnauthenticatedSession,
  isUnauthenticatedError,
} from "@/lib/auth-session"
import {
  buildErrorDiagnostics,
  copyTextToClipboard,
} from "@/lib/error-diagnostics"
import { logDevError } from "@/lib/utils"

interface Props {
  children: ReactNode
  /** Optional label shown in the error UI, e.g. "Foods" */
  label?: string
}

type ErrorBoundaryInnerProps = Props & {
  isAuthLoaded: boolean
  isSignedIn: boolean | undefined
  signOut?: () => void | Promise<void>
}

interface State {
  componentStack?: string
  diagnosticsStatus?: "copied" | "unavailable"
  error: Error | null
}

class ErrorBoundaryInner extends Component<ErrorBoundaryInnerProps, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logDevError("[ErrorBoundary]", error, info.componentStack)
    this.setState({ componentStack: info.componentStack ?? undefined })
    if (
      isUnauthenticatedError(error) &&
      this.props.isAuthLoaded &&
      !this.props.isSignedIn
    ) {
      void handleUnauthenticatedSession({ signOut: this.props.signOut })
    }
  }

  reset = () => {
    this.setState({
      componentStack: undefined,
      diagnosticsStatus: undefined,
      error: null,
    })
  }

  copyDiagnostics = async () => {
    if (!this.state.error) return

    const copied = await copyTextToClipboard(
      buildErrorDiagnostics(this.state.error, {
        componentStack: this.state.componentStack,
        label: this.props.label,
      })
    )

    this.setState({ diagnosticsStatus: copied ? "copied" : "unavailable" })
  }

  render() {
    if (!this.state.error) return this.props.children

    if (isUnauthenticatedError(this.state.error)) {
      return (
        <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-5 text-center">
          <section className="app-rail-surface p-5">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-muted/55">
              <Warning
                size={24}
                weight="fill"
                className="text-muted-foreground/70"
              />
            </div>
            <h1 className="text-[1.25rem] font-semibold tracking-tight">
              Could not sync your account
            </h1>
            <p className="mt-2 text-[13px] leading-5 text-muted-foreground/70">
              Your sign-in is still saved. Check your connection, then try
              again.
            </p>
            <button
              onClick={this.reset}
              className="mt-5 h-11 w-full rounded-[10px] bg-foreground text-[14px] font-semibold text-background transition-opacity active:opacity-75"
            >
              Try again
            </button>
          </section>
        </main>
      )
    }

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
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={this.reset}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-muted/60 px-4 text-[13px] font-medium transition-opacity active:opacity-60"
          >
            <ArrowCounterClockwise size={13} weight="bold" />
            Try again
          </button>
          <button
            type="button"
            onClick={() => void this.copyDiagnostics()}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-muted/60 px-4 text-[13px] font-medium transition-opacity active:opacity-60"
          >
            <Copy size={13} weight="bold" />
            Copy diagnostics
          </button>
        </div>
        {this.state.diagnosticsStatus && (
          <p
            role="status"
            className="max-w-xs text-[11.5px] leading-5 text-muted-foreground/60"
          >
            {this.state.diagnosticsStatus === "copied"
              ? "Diagnostics copied. Send them with your bug report."
              : "Clipboard is unavailable. Take a screenshot of this screen."}
          </p>
        )}
        {import.meta.env.DEV && (
          <pre className="mt-4 max-w-full overflow-auto rounded-xl bg-muted/40 p-3 text-left text-[10px] text-muted-foreground/60">
            {this.state.error.message}
          </pre>
        )}
      </div>
    )
  }
}

export function ErrorBoundary(props: Props) {
  const { signOut } = useClerk()
  const { isLoaded, isSignedIn } = useAuth()
  return (
    <ErrorBoundaryInner
      {...props}
      isAuthLoaded={isLoaded}
      isSignedIn={isSignedIn}
      signOut={signOut}
    />
  )
}
