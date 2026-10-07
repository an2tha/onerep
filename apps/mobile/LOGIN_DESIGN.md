---
name: OneRep login
description: An abstract glass sculpture beside a focused authentication form.
colors:
  source: "packages/ui/src/styles/palette.css"
  canvas: "var(--background)"
  panel: "var(--surface-panel)"
  ink: "var(--foreground)"
  artwork: "Clear glass with a restrained var(--accent-training-hero) attenuation tint"
rounded:
  control: "8px"
  welcome: "20px"
  mobile-control: "12px"
---

# OneRep Login Design

## Overview

This record covers the implemented login surface only. The existing `DESIGN.md` documents onboarding. Login uses operate mode: help returning users sign in and new users create an account with familiar, direct controls.

The welcome panel contains custom, interlocking glass contours rendered in Three.js. There are no Training, Nutrition, or Progress category labels or category color markers. The sculpture supports the brand without representing individual features. The adjacent form remains focused on authentication.

## Colors

Use the actual shared OneRep palette from `packages/ui/src/styles/palette.css` and the active visual identity. The user explicitly rejected the standalone apricot/plum palette. Login must not redefine shared theme variables or introduce its own light/dark colors.

Canvas, welcome panel, fields, text, dividers, errors, hover, and focus use the application's semantic tokens. The renderer reads the shared panel color and adds a restrained training-hero tint to otherwise neutral glass. Both appearances and selected app flavours update through inherited tokens.

## Typography

Instrument Sans Variable carries both display and functional text. Desktop welcome copy uses `clamp(40px, 5.1vw, 76px)`, weight 560, a 1.04 line height, and tight tracking. The desktop form title is 34px at weight 600. Mobile uses a 34px to 44px title at weight 560 as the main welcome message, without a duplicate marketing headline. Field labels are 13px, while tabs and buttons are 14px. Copy remains localized through the existing translation system.

## Layout

Desktop uses two columns inside 20px outer padding, adjusted for safe areas. The welcome panel has a 720px minimum height; the form is centered in a 380px maximum column. Between 761px and 1000px, outer padding and panel spacing tighten. At 1600px and above, the form side has a 620px minimum grid track.

At 760px and below, use one open canvas instead of a miniature welcome card. A 44px brand row places the logo on the left and motion control on the right. The marketing tagline is hidden; the live sign-in or sign-up heading becomes the primary welcome. The glass occupies the right side of that heading and uses the page background so its canvas blends seamlessly. The form follows directly below, with 24px side gutters (20px at 360px and below), 54px controls, and 12px control corners. Form width caps at 440px.

The header accommodates longer sign-up copy without a fixed height. Short landscape screens reduce the header and artwork height. Natural document scrolling keeps consent, social actions, and server settings reachable. Mobile views were checked at 390px for sign-in and 320px for sign-up with no horizontal overflow. Desktop keeps its two-column composition.


## Elevation & Depth

Flat color, borders, and spacing establish hierarchy. Login removes input and segmented-control shadows. The sculpture floats continuously: the two contours turn independently, the small glass pieces drift, and the studio environment shifts their reflections. Spring-based pointer tilt and a restrained tap impulse add physical response. A localized pause/resume control freezes and continues the current pose. Reduced motion renders the posed scene without movement. Rendering targets 30fps and stops offscreen or in a hidden tab; the visible-time clock prevents jumps when it resumes. Mode panels do not animate.

## Shapes

The desktop welcome panel has 20px corners. Desktop inputs and action buttons use 8px corners and a 50px minimum height. Mobile has no welcome panel frame; controls use 12px corners and a 54px minimum height. Two original closed 3D contours and two polished glass pebbles use physical transmission, thickness, refraction, and a generated studio environment. The scene loads independently of authentication, caps pixel density, disposes GPU resources on unmount, and rebuilds its reflection environment after WebGL context restoration. When WebGL is unavailable the decorative canvas is hidden and authentication remains usable.

## Components

- **Mode tabs:** A shared baseline and 2px active underline distinguish Sign in and Create account. Semantic tabs, a linked tab panel, roving focus, and Arrow Left, Arrow Right, Home, and End support keyboard selection.
- **Fields:** Persistent labels, explicit autocomplete, and visible focus outlines support entry. Password input reserves 48px for its reveal control. Password reset sits below the field, away from the reveal target.
- **Actions:** The primary action inverts the form's ink and paper colors. Available social providers remain secondary. Existing disabled, loading, error, and status handling is retained.
- **Sign-up:** Name, password guidance, minimum-age confirmation, Terms, and Privacy remain part of the existing flow.
- **Server selection:** A disclosure keeps server configuration available without competing with sign-in. Its collapsed contents are inert and its expanded state is exposed to assistive technology.
- **Authentication:** Existing email, social-provider, native OAuth, verification, reset, and redirect logic is retained. This redesign changes presentation and tab keyboard behavior.

Validation at implementation: desktop at 1440px, mobile at 390px, and the user's 908px dark layout were visually checked. Sign-up keyboard selection, password reveal, server expansion, and reset navigation were exercised. TypeScript, 26 auth tests, a six-locale check, and the development-mode Vite build passed. The production build was rejected by the existing safety guard because the configured Convex deployment was a development deployment. Successful live authentication and a production build are not established by these checks.

## Do's and Don'ts

- Do preserve the unified mobile welcome, local theme behavior, and clear form hierarchy.
- Do keep the custom sculpture abstract and the shared brand palette intact.
- Do retain keyboard, focus, loading, disclosure, recovery, and consent behavior alongside visual changes.
- Don't introduce login-only colors or override the shared palette.
- Don't enlarge decoration at the expense of reaching the form or bring back feature labels and category markers.

Implementation sources: `src/components/login-layout.tsx`, `src/components/login-glass.tsx`, `src/lib/login-glass-scene.ts`, `src/styles/login.css`, and `src/pages/Login.tsx`.
