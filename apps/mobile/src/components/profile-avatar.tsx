import { tr } from "@repo/ui/i18n"
import { useState } from "react"
import { useAppAuth } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"

export function ProfileAvatar() {
  const { user } = useAppAuth()
  const navigate = useSmoothNavigate()
  const [failed, setFailed] = useState(false)
  const initials = (user?.name || user?.email || "You")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
  return (
    <button
      type="button"
      className="profile-avatar"
      aria-label={tr("Open profile and settings")}
      onClick={() => navigate("/settings", { motion: "forward" })}
    >
      {user?.image && !failed ? (
        <img src={user.image} alt="" onError={() => setFailed(true)} />
      ) : (
        initials
      )}
    </button>
  )
}
