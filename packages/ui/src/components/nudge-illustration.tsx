/** Original, theme-aware vector scenes. Decorative: the adjacent copy carries meaning. */
export function NudgeIllustration({
  scene = "rest",
  className = "",
}: {
  scene?: "rest" | "return" | "food" | "log" | "week" | "welcome"
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 240 160"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`nudge-illustration ${className}`}
    >
      <g
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 140h196" opacity=".2" />
        {(scene === "rest" || scene === "welcome") && (
          <>
            <path
              d="M38 92c0-9 7-16 16-16h101c9 0 16 7 16 16v39H38Z"
              fill="var(--background)"
            />
            <path
              d="M30 103q0-12 12-12t12 12v18h105v-18q0-12 12-12t12 12v31H30Z"
              fill="var(--muted)"
            />
            <path d="M42 134v6m129-6v6" />
            <path
              d="M75 86q9-26 34-22l22 39-58 16-12-15Z"
              fill="var(--recovery-accent)"
            />
            <circle cx="109" cy="44" r="17" fill="var(--background)" />
            <path
              d="M94 42q0-21 20-16 14 3 12 19l-9-11q-7 10-23 8Z"
              fill="currentColor"
              stroke="none"
            />
            <path d="m107 61-3 10m3 11 13 16 22-15M79 107l38 4 29 18" />
            <path
              d="M66 109q36-12 64 5l23 15H57Z"
              fill="var(--recovery-accent)"
            />
            <path d="m81 117 17 10m14-12 17 14" opacity=".4" />
            <path d="M188 108h27m-24 0 3 32m17-32-3 32" />
            <path d="M190 88h16v14q-8 7-16 0Zm16 3h4q8 6-4 9M196 78q-5-5 0-10m7 9q-4-5 0-9" />
            <path d="m46 46 8-12m-21 25 10-3" opacity=".35" />
          </>
        )}
        {scene === "return" && (
          <>
            <path d="M40 101h109v13H40Zm9 13v26m91-26v26" fill="var(--muted)" />
            <circle cx="104" cy="35" r="16" fill="var(--background)" />
            <path d="M90 32q4-22 22-12l8 12-15-6-15 8" fill="currentColor" />
            <path
              d="M95 53q-20 6-22 43l35 7 18-30Z"
              fill="var(--recovery-accent)"
            />
            <path d="m104 66 31 32 26 21m-45-43 24 14 17 27M82 102l39 9 22 23m-35-32 29 4 19 26" />
            <path
              d="m144 127 13 1 10 7h20q5 0 6 6h-48Zm-9 7-11 1-12 7h38"
              fill="var(--recovery-accent)"
            />
            <path d="m155 128 7 6m0-8-7 8M181 53l5-9m9 18 10-2" opacity=".4" />
          </>
        )}
        {scene === "food" && (
          <>
            <path
              d="M41 95h103q-5 40-51 40T41 95Z"
              fill="var(--recovery-accent)"
            />
            <ellipse cx="92" cy="95" rx="51" ry="10" fill="var(--background)" />
            <path
              d="M63 94q15-15 28 0m3-2q10-14 24 0M70 69q-10-10 0-21m20 19q-10-10 0-21m20 21q-10-10 0-21"
              opacity=".6"
            />
            <path d="m164 69 5 66h33l5-66Z" fill="var(--background)" />
            <path
              d="m167 98 3 35h31l3-35Z"
              fill="var(--recovery-accent)"
              opacity=".5"
            />
            <path d="m139 84 15-39q4-8 8-5l-13 47" />
          </>
        )}
        {scene === "log" && (
          <>
            <path d="M43 37h114v99H43Z" fill="var(--muted)" />
            <path d="M53 28h108v99H53Z" fill="var(--background)" />
            <path d="M71 21v15m22-15v15m22-15v15m22-15v15M72 56h69M72 74h51M72 93h60" />
            <path
              d="m168 51 9-12 10 7-9 12-33 55-14 10 2-18Z"
              fill="var(--recovery-accent)"
            />
            <path d="m135 105 10 8m23-62 10 7" />
            <path d="M182 111h25v18q-12 11-25 0Zm25 4h6q9 8-6 11" />
          </>
        )}
        {scene === "week" && (
          <>
            <rect
              x="48"
              y="32"
              width="143"
              height="101"
              rx="8"
              fill="var(--background)"
            />
            <path d="M48 60h143M77 23v20m84-20v20" />
            <path
              d="M67 81h13m13 0h13m13 0h13m13 0h13m13 0h3M67 105h13m13 0h13m13 0h13m13 0h13"
              opacity=".3"
            />
            <path
              d="M64 117c17-35 31 11 49-15s32-33 59-20"
              stroke="var(--recovery-accent)"
              strokeWidth="5"
            />
            <circle cx="172" cy="82" r="5" fill="currentColor" stroke="none" />
          </>
        )}
      </g>
    </svg>
  )
}
