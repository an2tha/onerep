---
name: OneRep sleep and daily insights
description: Duration, dated goals, and recorded observations within the existing OneRep interface.
colors:
  night-backdrop: "#040817"
  night-background: "#080e21"
  night-foreground: "#edf2ff"
  night-secondary-text: "#becde6"
  night-muted: "#202d47"
  night-border: "#ffffff26"
  night-panel: "#15223a"
  night-error: "#ffb3bb"
  night-reading: "#9bb7ec"
typography:
  headline:
    fontSize: "30px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  duration:
    fontSize: "clamp(22px, 4.5vw, 30px)"
    fontWeight: 550
    lineHeight: 1.3
  section-title:
    fontSize: "19px"
    fontWeight: 600
  summary-title:
    fontSize: "15px"
    fontWeight: 600
  caption:
    fontSize: "13px"
    lineHeight: 1.6
  axis:
    fontSize: "11px"
rounded:
  control: "8px"
  action: "10px"
  mobile-section: "16px"
  timing-track: "3px"
spacing:
  tight: "4px"
  small: "8px"
  control-gap: "12px"
  group-gap: "16px"
  section: "24px"
components:
  night-input:
    backgroundColor: "{colors.night-panel}"
    textColor: "{colors.night-foreground}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  night-primary-action:
    backgroundColor: "{colors.night-foreground}"
    textColor: "{colors.night-background}"
    rounded: "{rounded.action}"
    padding: "12px 16px"
  selected-range:
    backgroundColor: "{colors.night-foreground}"
    textColor: "{colors.night-background}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
---

# Design System: OneRep sleep and daily insights

## Overview

This document records the existing sleep detail and Today summary components, exported through `@repo/ui/sleep`. It applies to this component boundary, not to onboarding or the whole app. The direction is Operate: make recorded sleep, the selected date, the dated goal, and the next useful action easy to understand.

Sleep detail inherits OneRep's night sky and restrained translucent sections on phones. Today inherits the active app theme and uses compact rows. Neither surface introduces a separate identity. Duration leads; calculations, stage estimates, and supporting observations are progressively disclosed.

Source authority: the two CSS files and three presentation components in this directory; the mobile adapter's `sleep-sky.css` and `detail-atmosphere.css` supply the detail atmosphere. Portable data contracts live in `packages/models/src/sleep-insights.ts`. The checked screenshots are the current and historical sleep views and Today views at phone and desktop widths in `.impeccable/review/sleep/` at the repository root. Their illustrative fixture banner is test scaffolding, not product UI.

## Colors

The night palette uses near-black blue behind pale text and blue recorded-duration bars. The frontmatter captures the atmosphere's concrete values. Reuse the app's semantic CSS properties in components so the same presentation works on Today.

- **Primary:** foreground supplies selected controls, the selected night, primary actions, and dashed goal lines. Reading blue supplies ordinary sleep bars and recorded timing periods.
- **Neutral:** background, muted, panel, border, and secondary text separate readings, labels, and controls. Night error supplies visible error feedback.
- **Today:** use `--foreground`, `--background`, `--muted-foreground`, `--border`, and `--accent-water`. Do not hard-code the night palette onto the daily summary. The ordinary chart bar retains its existing accent-water fallback.

**The Recorded Reading Rule.** Color distinguishes selection and readings, but captions, date labels, missing-reading text, and solid versus dashed marks carry meaning independently.

## Typography

Inherit the active OneRep font family. The UI library defaults to Instrument Sans Variable with a sans-serif fallback; palette choices may override that family. The shared sleep components do not set a new font.

The page title and responsive duration line establish the first reading level. Section titles follow, with smaller captions for source, date, coverage, and calculation limits. Today uses its compact title and row scale, with connected observations slightly larger than their captions. Use tabular numerals for chart axes, timing labels, duration values, and measurement rows. Keep the selected duration as text, not an oversized score dial.

## Layout

The sleep detail column has a maximum width of 720px. Its inherited desktop padding is 20px horizontally; the phone atmosphere uses 16px outer padding. Sections are separated by 24px vertical padding and rules on wider screens. Below 768px, sections become translucent panels with 22px vertical and 18px horizontal padding, separated by 16px.

Preserve the reading order: duration against the dated goal, source and coverage, duration chart, contextual focus, timing chart, optional measurements, connected observations, and the editable sleep plan. The 7-day chart fits the content column. The 28-day view allows horizontal scrolling with 36px per calendar day rather than compressing away dates or gaps. The chart region supports keyboard focus when scrollable.

Planned bedtime and wake time share a two-column row with a 16px gap, changing to one column at 360px and below. Headers and action groups wrap. Today remains a compact list of summaries with its customization control reachable even when all summaries are hidden. The host app owns Today column sizing and navigation.

## Elevation & Depth

The existing sky is decorative, behind the content, and does not receive pointer events. Desktop sleep content mostly uses rules and space. On phones, the inherited detail atmosphere uses translucent panels, a subtle inset edge, a diffuse shadow, and backdrop blur. Preserve this incumbent treatment locally; Today keeps the active app surface and flat row dividers. The scoped `.impeccable/design.json` records the observed mobile material, focus treatment, and breakpoints without duplicating the primitive tokens above.

## Shapes

Controls use modest rounded corners, with slightly rounder full-width primary actions and mobile sections. Timing tracks and chart bars have small corners so their measured lengths remain easy to compare. Dividers structure rows and desktop sections. Do not turn the duration, source, and coverage lines into extra badges or cards.

## Components

### Duration summary and chart

Lead with actual main-sleep duration and the goal for that waking day. Keep the usual-range qualification, source, waking date, and available update time nearby. The chart displays the full recorded duration, including values above the goal; only the percentage calculation is capped. Solid bars are sleep, segmented dashed lines are dated goals, and a gap with a small marker is a missing reading. Range buttons use `aria-pressed`; the selected date is also exposed in the individual-night list. That disclosure supplies dates, values or “No reading,” goals, and buttons to select a night.

### Timing and measurements

Show recorded main periods on a noon-to-noon axis. Dashed bedtime and wake guides represent the current plan, including on older dates. Pair the visual tracks with clock text or “Times unavailable.” Measurements and calculation remain in a native disclosure: duration percentage, efficiency, awake time, timing comparison, additional sleep, and wearable stage totals. Stage estimates are descriptive totals, never a fabricated chronological stage chart.

### Focus and connected observations

Current-day focus can suggest a modest action and link to planned times. Historical focus describes the selected night in past context and labels the action “Edit current sleep plan.” Connected observations name the seven-day date interval, reveal the underlying counts and check-in through a disclosure, and link to sleep, training, food, and check-in. Historical observations explicitly direct today's decisions back to current readings and current feelings. Evidence does not automatically change a plan or assert causation.

### Plan fields and primary action

Use labeled native select, time, and checkbox controls. Controls and actions have a minimum height of 44px; checkboxes are 18px within their larger labels. Time fields are optional and can be cleared. Explain when goal changes take effect and distinguish planned opportunity from time actually asleep. Save retains entered values on failure, exposes an alert, disables the fieldset while pending, and reports completion. The detail primary action spans the column. Hover reduces its opacity; keyboard focus uses a visible two-pixel outline.

### Today customization

The saved summary choices cover sleep, training, nutrition, and check-in. Show/hide checkboxes and explicit up/down buttons edit a draft; saving persists it and cancellation discards it. Boundary move controls are disabled. A failed save preserves the draft with a retryable message. Sleep remains the default visible summary and includes the compact calendar chart. When the selected day has no sleep reading, a fallback names the actual latest recorded date and explicitly says the selected day is missing. Connected observations remain a separate section below the configurable summaries.

### Disclosures and links

Use native `details` and `summary` for optional detail, visible underlined text links for review actions, and native buttons for changes. Disclosure summaries and links have 44px minimum interaction height. Focus is visible, hover underlines text actions, and disabled controls are visibly subdued. Decorative icons are hidden from assistive technology.

## Do's and Don'ts

- **Do** keep duration, waking date, and the dated goal together.
- **Do** preserve every calendar position and state missing readings explicitly.
- **Do** carry the current app theme into Today and the existing night atmosphere into sleep detail.
- **Do** distinguish recorded timing from the current optional plan and historical observations from today's advice.
- **Do** preserve drafts after failed saves and keep customization reachable when summaries are hidden.
- **Don't** imply that stages, efficiency, or timing change duration goal progress.
- **Don't** imply that a usual range establishes enough sleep, or that missing logs establish poor behavior.
- **Don't** label a provider platform as a known watch model or infer causes from co-occurring logs.
- **Don't** turn optional readings into a dominant score or replace the shared component behavior in an app adapter.
