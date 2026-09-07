import * as React from "react"

import {
  DEFAULT_VISUAL_IDENTITIES,
  ONE_REP_VISUAL_IDENTITY,
  resolveVisualIdentityTokens,
  type Appearance,
  type ResolvedAppearance,
  type VisualIdentity,
} from "../lib/visual-identity"

type Theme = Appearance
type ResolvedTheme = ResolvedAppearance

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
  identities?: readonly VisualIdentity[]
  defaultIdentity?: string
  identityStorageKey?: string
  disableTransitionOnChange?: boolean
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  identity: string
  setIdentity: (identity: string) => void
  identities: readonly VisualIdentity[]
  resolvedIdentity: VisualIdentity
}

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"
const THEME_VALUES: Theme[] = ["dark", "light", "system"]

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined)

function isTheme(value: string | null): value is Theme {
  if (value === null) {
    return false
  }

  return THEME_VALUES.includes(value as Theme)
}

function getSystemTheme(): ResolvedTheme {
  if (window.matchMedia(COLOR_SCHEME_QUERY).matches) {
    return "dark"
  }

  return "light"
}

function findIdentity(
  identities: readonly VisualIdentity[],
  identityId: string
): VisualIdentity | undefined {
  return identities.find((candidate) => candidate.id === identityId)
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style")
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}"
    )
  )
  document.head.appendChild(style)

  return () => {
    window.getComputedStyle(document.body)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove()
      })
    })
  }
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  const editableParent = target.closest(
    "input, textarea, select, [contenteditable='true']"
  )
  if (editableParent) {
    return true
  }

  return false
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  identities = DEFAULT_VISUAL_IDENTITIES,
  defaultIdentity = identities[0]?.id ?? "onerep",
  identityStorageKey = "visual-identity",
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    const storedTheme = localStorage.getItem(storageKey)
    if (isTheme(storedTheme)) {
      return storedTheme
    }

    return defaultTheme
  })
  const [identity, setIdentityState] = React.useState(() => {
    const storedIdentity = localStorage.getItem(identityStorageKey)
    if (storedIdentity && findIdentity(identities, storedIdentity)) {
      return storedIdentity
    }

    return defaultIdentity
  })
  const appliedIdentityTokens = React.useRef<Set<string>>(new Set())

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      localStorage.setItem(storageKey, nextTheme)
      setThemeState(nextTheme)
    },
    [storageKey]
  )

  const setIdentity = React.useCallback(
    (nextIdentity: string) => {
      if (!findIdentity(identities, nextIdentity)) {
        return
      }

      localStorage.setItem(identityStorageKey, nextIdentity)
      setIdentityState(nextIdentity)
    },
    [identities, identityStorageKey]
  )

  const resolvedIdentity =
    findIdentity(identities, identity) ??
    findIdentity(identities, defaultIdentity) ??
    ONE_REP_VISUAL_IDENTITY

  const applyTheme = React.useCallback(
    (nextTheme: Theme, nextIdentity: VisualIdentity) => {
      const root = document.documentElement
      const resolvedTheme =
        nextTheme === "system" ? getSystemTheme() : nextTheme
      const restoreTransitions = disableTransitionOnChange
        ? disableTransitionsTemporarily()
        : null

      root.classList.remove("light", "dark")
      root.classList.add(resolvedTheme)
      root.dataset.visualIdentity = nextIdentity.id

      for (const token of appliedIdentityTokens.current) {
        root.style.removeProperty(token)
      }

      const identityTokens = resolveVisualIdentityTokens(
        nextIdentity,
        resolvedTheme
      )
      const nextAppliedTokens = new Set<string>()
      for (const [token, value] of Object.entries(identityTokens)) {
        if (value === undefined) continue
        root.style.setProperty(token, value)
        nextAppliedTokens.add(token)
      }

      appliedIdentityTokens.current = nextAppliedTokens

      if (restoreTransitions) {
        restoreTransitions()
      }
    },
    [disableTransitionOnChange]
  )

  React.useEffect(() => {
    applyTheme(theme, resolvedIdentity)

    if (theme !== "system") {
      return undefined
    }

    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
    const handleChange = () => {
      applyTheme("system", resolvedIdentity)
    }

    mediaQuery.addEventListener("change", handleChange)

    return () => {
      mediaQuery.removeEventListener("change", handleChange)
    }
  }, [theme, resolvedIdentity, applyTheme])

  React.useEffect(() => {
    if (findIdentity(identities, identity)) return

    setIdentityState(defaultIdentity)
  }, [defaultIdentity, identities, identity])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (isEditableTarget(event.target)) {
        return
      }

      if (event.key.toLowerCase() !== "d") {
        return
      }

      setThemeState((currentTheme) => {
        const nextTheme =
          currentTheme === "dark"
            ? "light"
            : currentTheme === "light"
              ? "dark"
              : getSystemTheme() === "dark"
                ? "light"
                : "dark"

        localStorage.setItem(storageKey, nextTheme)
        return nextTheme
      })
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [storageKey])

  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) {
        return
      }

      if (event.key !== storageKey) {
        return
      }

      if (isTheme(event.newValue)) {
        setThemeState(event.newValue)
        return
      }

      setThemeState(defaultTheme)
    }

    window.addEventListener("storage", handleStorageChange)

    return () => {
      window.removeEventListener("storage", handleStorageChange)
    }
  }, [defaultTheme, storageKey])

  React.useEffect(() => {
    const handleIdentityStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return
      if (event.key !== identityStorageKey) return

      const nextIdentity = event.newValue
      if (nextIdentity && findIdentity(identities, nextIdentity)) {
        setIdentityState(nextIdentity)
        return
      }

      setIdentityState(defaultIdentity)
    }

    window.addEventListener("storage", handleIdentityStorageChange)
    return () => {
      window.removeEventListener("storage", handleIdentityStorageChange)
    }
  }, [defaultIdentity, identities, identityStorageKey])

  const value = React.useMemo(
    () => ({
      theme,
      setTheme,
      identity,
      setIdentity,
      identities,
      resolvedIdentity,
    }),
    [theme, setTheme, identity, setIdentity, identities, resolvedIdentity]
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext)

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  return context
}
