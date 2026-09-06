---
name: OneRep onboarding
description: Structured setup using OneRep's shared theme and a focused step layout.
typography:
  display:
    fontFamily: '"Instrument Sans Variable", sans-serif'
    fontSize: "clamp(30px, 4vw, 46px)"
    fontWeight: 620
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  body:
    fontFamily: '"Instrument Sans Variable", sans-serif'
    fontSize: "15px"
    lineHeight: 1.7
rounded:
  navigation: "8px"
  choice: "9px"
  action: "10px"
  card: "12px"
components:
  button-primary:
    rounded: "{rounded.action}"
    padding: "14px 20px"
    width: "100%"
---

# Design System: OneRep onboarding

## Overview

This document captures the implemented onboarding surface only. It does not replace the visual conventions of other OneRep screens. The structure follows the user-approved direction in [PRODUCT.md](PRODUCT.md): visible setup navigation, one focused content region, appearance previews, and an editable review.

The interface uses clear headings, neutral surfaces, bordered choices, and direct actions. Brand expression comes from Instrument Sans, the OneRep mark, spacing, and consistent control shapes. Existing Settings sections retain their shared application components when opened from setup.

Implementation sources are [setup.css](src/pages/onboarding/setup.css), [OnboardingMobile.tsx](src/pages/OnboardingMobile.tsx), [setup-preferences.tsx](src/pages/onboarding/setup-preferences.tsx), and the shared [UI stylesheet](../../packages/ui/src/index.css). This is a source-derived record. Browser validation was unavailable; rendered layout, contrast, device behavior, and screenshots have not been verified.

## Colors

Use shared theme properties rather than a separate onboarding palette. `--background` supplies the canvas; `--foreground` supplies headings, primary actions, and selected choices. Inverted controls use the background color for their text. `--surface-panel` distinguishes the sidebar and cards. `--muted-foreground` carries descriptions and secondary labels; `--border` supplies dividers and control outlines.

Light, dark, and device-matched appearance use the shared theme provider. Preserve those bindings when extending setup. The small theme previews have their own illustrative light and dark colors defined in setup.css; those swatches are preview artwork, not replacements for application theme tokens. Errors use the shared destructive color.

## Typography

Display and body text inherit `--font-sans`, currently Instrument Sans Variable with a sans-serif fallback. The frontmatter records the implemented display and descriptive-body styles.

Main headings are limited to 18 characters in line-length units (`18ch`) with balanced wrapping. Descriptions are limited to `62ch`. Feature titles use 17px at weight 650; feature descriptions use 14px with 1.6 line height. Navigation labels use 14px; secondary labels and topbar details use 13px. Step numbers use tabular numerals.

## Layout

Desktop setup has a 260px sidebar and a flexible main region. The sidebar carries the mark, step list, and a short Settings reminder. The main region occupies the viewport height (`100svh`), with a topbar, progress line, and independently scrolling content. The page container has a 720px maximum width, centered with 56px top padding and 40px horizontal padding.

At widths of 767px and below, the sidebar becomes a top region and the steps become a horizontally scrollable list. Content returns to document scrolling, with 30px top padding and 24px horizontal padding. Respect safe-area insets at the top and bottom. Feature overview rows use a title/detail grid: 105px for titles on desktop and 76px on mobile.

Keep a single active step in the content region. The desktop checklist and mobile step strip represent the same sequence. Editable review rows return to their corresponding step. The step heading receives focus when the active step changes.

## Elevation & Depth

Setup cards, primary buttons, chips, and conversation bubbles explicitly remove shadows. Surface colors and thin borders provide separation. Use dividers for the feature overview, settings entries, and review rows; avoid adding decorative shadow layers to these patterns.

## Shapes

Use the recorded radius roles for navigation, choices, primary actions, and cards. Choices are compact rounded rectangles with a border. Selected choices invert foreground and background. Primary actions span the content width and have a minimum height of 52px. Choice buttons have a minimum height of 44px; the larger goal and experience chips use 54px.

## Components

- **Step navigation:** numbered steps with a check for earlier positions, an inverted current step, and muted disabled future steps. Preserve the `aria-current="step"` state and navigation label.
- **Theme selector:** three preview buttons for light, dark, and device-matched appearance. A 2px outline with 2px offset identifies the selected preview; `aria-pressed` exposes selection.
- **Choice groups:** fieldsets with visible legends and wrapping button rows. Selection is communicated through both inversion and `aria-pressed`. Multi-select groups retain independent toggles.
- **Forms:** labeled selects, a native dashboard checkbox, and the existing shared number-question controls. Selects use the current theme background and foreground.
- **Connections:** full-width rows with a title, description, and directional icon. These open real Settings panels. Keep the settings controls consistent with their existing application presentation.
- **Import:** an export guide, explicit unit choice, file selection, preview, and commit controls. Preserve distinct reading, importing, error, and completed states.
- **Review:** divided rows show the chosen values and an edit icon, followed by the calculated target card, consent, and final action.
- **Coach:** static explanatory preview and optional live assistance use existing shared Coach components. The setup sequence does not simulate a typed conversation.

Keyboard focus for setup buttons, inputs, and selects uses a 2px foreground outline with 4px offset. Hover-capable devices apply a brightness adjustment to enabled buttons. The progress line transitions over 200ms with ease-out timing. Reduced-motion preferences disable setup animations and transitions.

## Do's and Don'ts

- Do extend the shared foreground, background, surface, and border token bindings across both themes.
- Do retain visible labels, selection states, progress, and editable review paths.
- Do keep descriptive content near the control it explains.
- Do use existing Settings and Coach components for those capabilities.
- Don't turn the step sequence back into simulated chat or introduce typing delays.
- Don't duplicate the shared palette as fixed colors in setup controls.
- Don't treat this source inspection as visual or native-device validation.
