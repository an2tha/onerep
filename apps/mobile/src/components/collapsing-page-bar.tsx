import { useEffect, useState } from "react"
import { ArrowLeft } from "@phosphor-icons/react"
import { useSmoothNavigate } from "@/lib/navigation"
import { ProfileAvatar } from "./profile-avatar"
import "./page-chrome.css"

/** Observe the actual page title, including pages with their own scroll container. */
export function CollapsingPageBar({ pathname }: { pathname: string }) {
  const navigate = useSmoothNavigate()
  const [title, setTitle] = useState("")
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    let frame = 0
    const sync = () => {
      frame = 0
      const heading = document.querySelector<HTMLElement>(
        ".app-route-frame-current h1"
      )
      const bar = document.querySelector<HTMLElement>(".collapsing-page-bar")
      setTitle(heading?.textContent?.trim() ?? "")
      setCollapsed(
        Boolean(
          heading &&
          heading.getBoundingClientRect().bottom <
            (bar?.getBoundingClientRect().bottom ?? 64)
        )
      )
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(
      document.querySelector(".app-route-frame-current") ?? document.body,
      { childList: true, subtree: true, characterData: true }
    )
    document.addEventListener("scroll", schedule, true)
    window.addEventListener("resize", schedule)
    sync()
    return () => {
      observer.disconnect()
      document.removeEventListener("scroll", schedule, true)
      window.removeEventListener("resize", schedule)
      cancelAnimationFrame(frame)
    }
  }, [pathname])
  return (
    <header className="collapsing-page-bar" data-collapsed={collapsed}>
      <button
        type="button"
        aria-label="Back"
        className="page-bar-back"
        onClick={() =>
          window.history.length > 1 ? navigate(-1) : navigate("/")
        }
      >
        <ArrowLeft size={21} />
      </button>
      <span className="page-bar-title" aria-hidden={!collapsed}>
        {title}
      </span>
      <ProfileAvatar />
    </header>
  )
}
