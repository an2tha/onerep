---
name: OneRep Workout Studio
description: An immersive gym interview that builds an editable workout with Jev.
colors:
  studio-ground: "#0b0e10"
  studio-ink: "#f5f3ee"
  studio-muted: "#c0c2c0"
  studio-metal: "#dfc89e"
  option-surface: "#171c20f2"
  option-selected: "#30383e"
  selection-blue: "#c5ddef"
  muscle-selected: "#354753"
  check-fill: "#bcd9ed"
  field-surface: "#0d1114b8"
  error-ink: "#ffc4b6"
  error-surface: "#39211fe8"
typography:
  headline:
    fontFamily: '"Instrument Sans Variable", sans-serif'
    fontSize: "clamp(40px, 5.3vw, 76px)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  choice:
    fontSize: "16px"
    fontWeight: 450
  detail:
    fontSize: "13px"
    lineHeight: 1.5
  cost:
    fontSize: "11px"
    lineHeight: 1.5
rounded:
  option-surface: "18px"
  choice: "11px"
  field: "8px"
  muscle: "6px"
  icon-button: "50%"
spacing:
  surface-inset: "7px"
  actions-gap: "24px"
components:
  option-surface:
    backgroundColor: "{colors.option-surface}"
    rounded: "{rounded.option-surface}"
    padding: "7px"
  choice-selected:
    backgroundColor: "{colors.option-selected}"
    textColor: "{colors.studio-ink}"
    rounded: "{rounded.choice}"
    padding: "12px 14px"
  next:
    backgroundColor: "#f5f3ee12"
    textColor: "{colors.studio-ink}"
    rounded: "{rounded.icon-button}"
    width: "44px"
    padding: "10px"
  notes:
    backgroundColor: "{colors.field-surface}"
    textColor: "{colors.studio-ink}"
    rounded: "{rounded.field}"
    padding: "14px"
---

# Design System: OneRep Workout Studio

## Overview

**Creative North Star: "One continuous dark gym"**

A premium training consultation unfolds inside a metric-scale, Blender-authored gym. Graphite equipment, textured concrete and rubber, warm practical lights, and cool blue ceiling LEDs give the room physical presence. One large question and a quiet answer menu stay in the foreground as the camera moves between training stations.

This document covers the guided workout creator and editor in this directory. It supersedes the earlier isolated barbell and live-brief composition. It does not change the onboarding design in `apps/mobile/DESIGN.md`. The durable product boundary is answer, refine, preview, explicitly apply to the existing editor, then save there.

**Key Characteristics:**

- A full-bleed room with continuous camera motion and physical progress lighting.
- Restrained foreground text, recessed selections, and icon navigation.
- Editable answers, custom input, final notes, and an explicit preview handoff.

## Colors

The four `studio-*` frontmatter values map to scoped CSS variables. Near-black ground supports the room and its fallback; warm off-white carries foreground questions and controls; muted text supports details and the request-cost footnote. Warm metal appears in focus rings, text selection, exercise numbering, and hover feedback.

The recessed answer surface and its raised selected row use charcoal tones. Cool blue marks selection checks and selected muscles, echoing the physical ceiling luminaire. Selection also uses checks and `aria-pressed`, not color alone. Error text sits on its own warm, dark surface.

**The Readable Foreground Rule.** Preserve the full-height dark scrim and the stronger local review scrim. Long text must retain contrast as the camera changes position.

## Typography

The guide inherits `var(--font-sans)`, whose shared default is Instrument Sans Variable with sans-serif fallback. Questions dominate at the frontmatter headline scale, balanced to a maximum of 10ch. Loading status uses the same size with weight 550 and an 11ch measure. The actual recessed menu uses 16px/450 answers; muscle labels and group headings are 13px. Fields use 16px at 1.5 line height. Preview exercise names are 17px/550, with 13px supporting details.

At widths of 760px or less, question and loading sizes become `clamp(38px, 11.8vw, 58px)` with an 11ch question measure. Review headings are 38px on mobile and `clamp(36px, 4vw, 54px)` on desktop, with a 15ch measure. Keep copy concise, concrete, and sentence case. Question detail paragraphs and visible step counters are intentionally absent from the interview.

## Layout

The fixed room and scrim fill the viewport behind a naturally scrolling foreground. The page has a `100svh` minimum height, safe-area-aware vertical padding, and 5vw horizontal padding. The header and workspace are capped at 1400px. A close icon occupies the header; the question sits near the upper left. A 470px maximum-width answer area settles toward the bottom through flex layout and responsive vertical spacing. Navigation and the request-cost footnote align with that answer area.

At 760px and below, horizontal padding is 26px and the same room remains full-bleed. The camera uses a 54-degree field of view after sizing. Below 350px padding becomes 20px and the answer-review grid becomes one column. At heights of 680px or less, headings reduce to 38px and answer spacing reduces. The first muscle question has 80px of top spacing before its menu. The final notes label begins after 140px of flexible breathing room.

Final notes and preview use a 640px maximum-width workspace and a stronger local scrim. Review answers remain behind a disclosure, arranged in two columns except at the narrowest breakpoint. Content and actions remain in document flow so expanded groups, custom answers, and long previews can scroll.

## Elevation & Depth

The room is real geometry loaded from `studio.glb`, with PBR normal and roughness maps, baked diffuse irradiance and contact shadows, and an HDR reflection probe rendered inside the same gym. Concrete and leather sources are Poly Haven CC0 assets with provenance beside source files. The floor has authored EPDM granules, roughness and normal maps; the ceiling has its own concrete material. The served assets are the GLB, `studio-reflections.hdr`, and `studio-poster.webp`. The poster is visible during load and after failure. See `scripts/workout-studio/README.md` for regeneration and attribution.

**The Baked Light Rule.** Preserve the runtime conversion of materials marked `studioLightmap` from the glTF emissive texture slot to the lightMap slot, clearing their emissive contribution. Connect transport emission only after every bake completes, so earlier bakes do not illuminate later ones. One 2048px key-light shadow map renders on load and is reused during camera movement. Lower fill light preserves equipment silhouettes. The moving practical light supplies loading feedback; no full-screen postprocessing is used.

The answer menu is one recessed surface with `0 18px 42px #00000066, inset 0 1px 0 #ffffff12`. Its selected row uses `0 3px 8px #00000030, inset 0 1px 0 #ffffff10`. Individual muscle controls remain flat at rest. Custom input has a restrained `0 16px 35px #00000040` shadow.

Camera stations include overview, rack, bench, dumbbells, floor, and clock, selected from the current question and answers. Duration also moves the room clock hand. Ten thicker, saturated blue segments on a lowered suspended ceiling light fill with interview progress. Depth-tested additive glow quads and a blue ceiling spill light keep the fixture visible, with tone mapping disabled on the diffusers. Loading pulses those segments and moves a warm practical light with a gentle camera drift. Loading text replaces the question; there is no foreground spinner.

Question travel fades from its current computed opacity over 160ms and in over 400ms, preserving continuity when loading ends. The custom field opens from zero grid height with a 24px rise and a 650ms ease. The loaded canvas fades in over 900ms. Reduced motion bypasses question travel, removes CSS keyframe animation, shortens CSS transitions to 100ms, snaps camera/clock/progress changes, and disables loading camera drift and LED pulsing.

Three.js and loaders are dynamically imported. The renderer requests low power, caps pixel ratio at 1.25, uses ACES filmic tone mapping, and targets up to 60fps while moving. It submits no settled or hidden frames, though the lightweight animation-frame scheduler remains active. Resize, visibility, motion preference, station, duration, progress, and loading changes invalidate the scene. Resources are disposed on unmount or WebGL context loss.

## Shapes

A rounded menu contains the choices as a coherent control surface. Its radius is 18px, selection rows use 11px, fields and errors use 8px, and flat muscle controls use 6px. Muscle checks are small squared marks with 4px corners; unselected single choices use circular outlines. Next is a 44px circular icon control; Back and Close are quiet icons with minimum 44px targets. Menu rows have a 49px minimum height and muscle controls a 44px minimum height.

## Components

### Interview and muscle selection

The current question bank has 94 questions. A session presents nine prompts: six core questions, two Jev-selected follow-ups, and final notes. The shared maximum is ten. Both creation and editing begin with muscle focus; the next prompt asks for a goal or desired change respectively.

Muscle groups expand through native disclosures, with the first group initially open. Users can select multiple specific muscles. Selected counts appear beside group names. Whole regions is a separate disclosure offering full, upper, or lower body. Choosing a region replaces individual muscle selection. Continue requires an answer and never advances on selection alone.

Every question includes Custom answer. Selecting it clears the previous answer and animates a labeled textarea into view, then focuses it. Input is limited to 300 characters. Empty or whitespace-only custom text cannot continue. Hidden custom input is inert and hidden from assistive technology. Selections invoke the existing haptic helper.

### Final notes and preview

The ninth prompt asks for additional notes, limited to 500 characters. Notes are optional unless the user explicitly selected specific restrictions. That choice makes the field required, asks which movements to avoid, exposes helper text when empty, and blocks generation until non-whitespace text exists. Review answers is a disclosure with editable rows. Each row has an accessible name containing its question and answer. Revisiting and changing a core answer clears dependent follow-up answers and revalidates selected follow-ups.

The generated preview lists exercises, sets, reps, and rest. Why this workout? reveals the rationale. Back discards the generated preview and returns to the notes stage. Open in editor explicitly applies the draft. Editing copy explains that applying replaces editor exercises and that saved data changes only when the editor is saved.

### Navigation, feedback, and recovery

Close, Back, and Next use icons. Native buttons retain accessible names; Back and Next also have action-specific titles. The Next name becomes Continue, Try again, Build with AI, or Open in editor. The pre-preview footnote states: “Uses 2 AI requests. Rebuilding uses 1 more.”

Planning, generation, and application show distinct status headings with `role="status"` and workspace `aria-busy`. The foreground fades away and becomes inert and `aria-hidden` during work; navigation disables. A synchronous lock prevents duplicate async requests. Close remains available except while applying. Failed requests show a `role="alert"` message and preserve answers for recovery. Controls also disable during question travel.

Session storage retains validated answers, eligible follow-ups, position, and notes in the current tab. Generated drafts are not restored. Successful application clears the stored session. Storage failure does not block the flow. Room download, WebGL, and context-loss failures fall back to the poster while the interview remains usable.

### Accessibility and integration

Question groups reference the heading; selection uses `aria-pressed`. A polite screen-reader-only announcement reports question number out of nine. The decorative room is `aria-hidden`; it is not the only progress cue. Question and preview transitions focus the heading without forced scroll. Controls and disclosures have a 2px warm-metal focus outline with 5px offset. Disabled controls fade to 0.4 opacity, or 0.3 for Next. Pointer hover changes background or color only on hover-capable devices.

The view receives planning, generation, application, and close callbacks. The guided service uses TypeSafe Jev for follow-up selection and the existing OpenRouter LLM for final evaluation and preset generation. Catalog IDs and set values are validated before applying the result. Matching exercises, editor state, and saving remain outside this component. Translation keys are used, with English fallbacks where translated copy is unavailable.

The studio reviewer approved the final implementation to ship. Final checks passed: mobile typecheck, the development-mode production-optimized Vite build, i18n catalog validation, diff check, and fresh mobile and desktop full-flow tests. Current visual evidence includes `studio-final-mobile.png`, `studio-live-desktop.png`, loading captures, and `studio-motion.mp4` / `.webm` under `apps/mobile/.impeccable/review/`. Earlier `guide-*` captures record the superseded composition. Browser component tests use mocked service callbacks and cover preview/apply, failure/retry, persistence, keyboard use, restrictions, room failure, custom answers, multi-muscle selection, and scene feedback. These do not establish live AI quality, full native behavior, complete localization, or a comprehensive assistive-technology audit.

The latest shadow/material revision measures approximately 60fps (16.73ms mean, 16.70ms median) using the Apple M4 Max ANGLE Metal renderer at a 390 by 844 drawing buffer, with zero idle frames. Earlier captures measured approximately 57fps after optimization versus 27fps before. Evidence: `.impeccable/review/perf-shadows.json`. This is desktop hardware at a narrow viewport, not a phone measurement or a universal 60fps guarantee.

## Do's and Don'ts

- Do preserve one continuous room and a concise foreground question.
- Do keep physical blue progress lighting consistent with answered progress and loading state.
- Do preserve required restriction notes, editable answers, error recovery, and preview/apply/save boundaries.
- Do keep the interview usable when 3D assets or WebGL fail.
- Don't restore the old isolated barbell, side brief, visible progress bar, or text-heavy header.
- Don't add idle rendering, per-frame shadow-map updates, or postprocessing without fresh performance evidence.
- Don't remove baked-light conversion or replace room-specific reflections with an unrelated environment.
- Don't treat desktop benchmark results as phone performance, or fixture tests as live service validation.

## Final evaluation and notes layout

Jev selects the two adaptive follow-up questions. A single LLM request through the existing OpenRouter provider evaluates all answers, final notes, a bounded compatible exercise catalog and relevant safety constraints. The result is validated against catalog IDs and bounded set/rep/rest values, then opened as an editable preset. A needs-details response preserves answers; failed generation is refunded. The completed flow still uses two AI requests.

The notes step is a compact 560px maximum column without a full-height backdrop or automatic vertical spacer. Textareas include their padding in the available width. Expected errors are short structured messages; raw Convex errors, request IDs and stack traces never render in the form.
