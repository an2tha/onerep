/** Small, code-native illustrations sharing the app's text and accent colours. */
export function GoalsArt({
  kind = "welcome",
}: {
  kind?: "welcome" | "range" | "adapt"
}) {
  return (
    <svg
      viewBox="0 0 320 148"
      fill="none"
      className="goals-art"
      aria-hidden="true"
    >
      {kind === "welcome" ? (
        <>
          <path
            d="M30 116H290M30 78H290M30 40H290"
            stroke="currentColor"
            opacity=".12"
          />
          <path
            d="M36 112L80 100L124 105L170 75L214 80L276 30"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx="170"
            cy="75"
            r="6"
            fill="var(--background)"
            stroke="currentColor"
            strokeWidth="3"
          />
          <circle
            cx="276"
            cy="30"
            r="14"
            fill="var(--goals-accent)"
            fillOpacity=".18"
          />
          <circle cx="276" cy="30" r="5" fill="var(--goals-accent)" />
        </>
      ) : kind === "range" ? (
        <>
          <rect
            x="28"
            y="55"
            width="264"
            height="32"
            rx="16"
            fill="currentColor"
            opacity=".08"
          />
          <rect
            x="120"
            y="55"
            width="88"
            height="32"
            rx="4"
            fill="var(--goals-accent)"
            fillOpacity=".28"
          />
          <path
            d="M120 40V102M208 40V102"
            stroke="var(--goals-accent)"
            strokeDasharray="3 4"
          />
          <path d="M164 35V107" stroke="currentColor" strokeWidth="3" />
          <circle
            cx="164"
            cy="71"
            r="7"
            fill="var(--background)"
            stroke="currentColor"
            strokeWidth="3"
          />
        </>
      ) : (
        <>
          <path
            d="M68 85C68 35 137 18 174 40M246 62C265 108 207 137 159 116"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 6"
            opacity=".4"
          />
          <path
            d="M165 28L179 41L162 46M168 107L153 116L164 128"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="37"
            y="72"
            width="72"
            height="42"
            rx="12"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M54 93H92M61 85V101M85 85V101"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle
            cx="239"
            cy="43"
            r="27"
            fill="var(--goals-accent)"
            fillOpacity=".15"
          />
          <path
            d="M227 43L236 52L252 34"
            stroke="var(--goals-accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  )
}
