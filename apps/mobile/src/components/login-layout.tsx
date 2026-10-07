import { tr } from "@repo/ui/i18n"
import type { ReactNode } from "react"
import { LoginGlass } from "./login-glass"
import { AuthMark } from "./auth-shell"
import "../styles/login.css"

export function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="login-page">
      <aside className="login-welcome" aria-label={tr("OneRep")}>
        <div className="login-brand">
          <AuthMark />
        </div>
        <div className="login-welcome-copy">
          <p>{tr("Your whole routine.")}</p>
          <p>{tr("Right here.")}</p>
        </div>
        <LoginGlass />
      </aside>
      <main className="login-main">
        <div className="login-form-column">{children}</div>
      </main>
    </div>
  )
}
