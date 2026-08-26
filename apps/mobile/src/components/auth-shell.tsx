import { type ReactNode } from "react"

/**
 * Shared chrome for the unauthenticated screens (sign in, create account,
 * password reset) so they read as one flow rather than three pages.
 *
 * Laid out the way a login screen has always been laid out: the lockup at the
 * top of a centred column, the form under it, the small print at the bottom.
 * The type and the controls are the app's own, but the shape is the familiar
 * one. This is the first screen anybody sees, and it is the wrong place to be
 * clever — no ambient gradient, no floating panel, nothing to decode.
 */
export const AUTH_BACKDROP_CLASS = "min-h-svh bg-background text-foreground"

/** Kept for the screens that ask for "the auth section". No longer a card. */
export const AUTH_CARD_CLASS = "mt-8"

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={AUTH_BACKDROP_CLASS}>
      <div className="flex min-h-svh flex-col">
        {/*
          A fixed column, not `app-page`: that one widens to 76rem past 768px,
          which is correct for a dashboard and ridiculous for a sign-in form —
          on a laptop the fields ran the full width of the window.
        */}
        <main className="mx-auto my-auto w-full max-w-[25rem] px-[var(--app-page-x)] pt-[calc(var(--app-safe-top)+2rem)] pb-[var(--app-safe-bottom-lg)]">
          {children}
        </main>
      </div>
    </div>
  )
}

/**
 * The mark, drawn bare rather than sitting in its launcher tile: on a screen
 * this is a logo, not the app icon quoted back at you. The strokes are the
 * ones `scripts/build-icons.mjs` generates every raster from.
 */
function OneRepMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <g
        stroke="currentColor"
        strokeWidth={25}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M152 204 C 146 144 179 120 230 120 C 281 120 313 144 307 204" />
        <path d="M224 242 C 208 200 173 180 143 186 C 111 192 89 218 91 256 C 93 296 125 336 179 362 C 203 372 231 360 253 342" />
        <path d="M224 242 C 241 202 275 184 305 192 C 329 200 341 220 335 240" />
        <path d="M253 342 C 293 320 333 280 393 200" />
        <path d="M359 280 C 359 324 343 370 303 404 C 271 430 243 436 227 418 C 213 402 219 382 235 378" />
      </g>
      <path d="M426 158 L 409 231 L 356 191 Z" fill="currentColor" />
    </svg>
  )
}

/** Mark and wordmark, locked up. The app's name, said once, at the top. */
export function AuthMark() {
  return (
    <div className="flex items-center justify-center gap-2.5">
      <OneRepMark className="size-9 shrink-0" />
      <span className="text-[1.4rem] leading-none font-[720] tracking-[-0.03em]">
        OneRep
      </span>
    </div>
  )
}

/** Google's brand mark, which their sign-in guidelines require us to use as-is. */
export function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className="size-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}

/**
 * Apple's mark, drawn in `currentColor` because their guidelines want the logo
 * to match the button's text rather than carry a colour of its own.
 */
export function AppleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className="size-[18px]">
      <path
        fill="currentColor"
        d="M13.62 9.47c-.02-1.79 1.46-2.65 1.53-2.69-.83-1.22-2.13-1.39-2.59-1.4-1.1-.11-2.15.65-2.71.65-.56 0-1.42-.63-2.34-.62-1.2.02-2.31.7-2.93 1.77-1.25 2.17-.32 5.38.9 7.14.6.86 1.31 1.83 2.24 1.79.9-.04 1.24-.58 2.33-.58 1.08 0 1.4.58 2.35.56.97-.02 1.58-.88 2.17-1.75.68-1 .96-1.97.98-2.02-.02-.01-1.88-.72-1.93-2.85ZM11.85 4.2c.5-.6.83-1.44.74-2.28-.71.03-1.58.48-2.09 1.08-.46.53-.86 1.38-.75 2.2.79.06 1.6-.4 2.1-1Z"
      />
    </svg>
  )
}
