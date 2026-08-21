import { useEffect, useState } from "react"

const DEFAULT_MOBILE_BREAKPOINT = 1024

function getIsMobileResolution(breakpoint: number) {
  if (typeof window === "undefined") return false
  return window.matchMedia(`(max-width: ${breakpoint}px)`).matches
}

export function useIsMobile(
  breakpoint: number = DEFAULT_MOBILE_BREAKPOINT
): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    getIsMobileResolution(breakpoint)
  )

  useEffect(() => {
    if (typeof window === "undefined") return

    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const handleChange = () => setIsMobile(mediaQuery.matches)

    handleChange()
    mediaQuery.addEventListener("change", handleChange)

    return () => {
      mediaQuery.removeEventListener("change", handleChange)
    }
  }, [breakpoint])

  return isMobile
}

export const useIsMobileResolution = useIsMobile
