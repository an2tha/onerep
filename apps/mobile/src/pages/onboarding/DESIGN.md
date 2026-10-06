---
name: OneRep Pavilion Onboarding
description: A standalone Blender pavilion with live app appearance and identity adaptation.
typography:
  headline:
    fontFamily: '"Instrument Sans Variable", sans-serif'
    fontSize: "clamp(36px, 4.4vw, 64px)"
    fontWeight: 560
    lineHeight: 1.04
    letterSpacing: "-.04em"
  body:
    fontSize: "14px"
    lineHeight: 1.65
rounded:
  choice: "6px"
  action: "7px"
  panel: "8px"
spacing:
  choice-gap: "8px"
  mobile-gutter: "24px"
components:
  button-primary:
    backgroundColor: "var(--foreground)"
    textColor: "var(--background)"
    rounded: "{rounded.action}"
    padding: "14px 20px"
  step-menu:
    backgroundColor: "var(--surface-panel)"
    rounded: "{rounded.panel}"
    padding: "24px"
---

# Design System: OneRep Pavilion Onboarding

## Overview

**Creative North Star: "The OneRep Pavilion"**

A standalone architectural pavilion brings movement, nutrition, recovery, and planning into four furnished spaces. Scanned concrete floors, curved plaster walls, oak vaults, and segmented ring lights give each stage a physical setting. The movement bench, mat, and kettlebells; fluted nutrition island; leather recovery lounge seating; and planning desk make the stations recognizable.

The scene was authored through live Blender MCP and combines its own architecture and furnishings with Poly Haven scanned materials and a photographed forest HDR environment. Flat-base kettlebells, mat edging, rib anchor plates, and ring supports add construction detail. It does not reuse the workout gym. This scoped specification replaces the rejected dark gym direction for onboarding only. The direction remains code-led, with no approved visual comp or real user research claimed.

**Key Characteristics:**

- Four pavilion stations connected by one camera.
- Live light, dark, system appearance, and visual identity adaptation.
- Existing setup logic, safety, consent, and editable review remain intact.

## Colors

The foreground inherits app background, foreground, panel, border, and focus variables. There are no local fixed dark palette overrides. The renderer reads the resolved workout accent for practical ring lights, accent furnishings, and screen glow. A root attribute observer follows appearance and identity changes, including system appearance updates applied by the app.

**The Live Identity Rule.** Theme selection changes both the functional interface and the pavilion's lighting and materials.

Light appearance preserves scanned concrete, plaster, wood, wool, rubber, gravel, and foliage detail through restrained exposure and illumination. Dark appearance deepens those same materials. Appearance and accent changes interpolate smoothly, or snap when reduced motion is active.

## Typography

Use the shared Instrument Sans Variable family. Headings are balanced, tightly tracked, and limited to short lines. Desktop introductory type scales larger than later stage headings. At the mobile breakpoint, stage headings use 42px and the introduction uses 54px. Body explanations stay readable over the scene shade, with a maximum width of 48ch. Headings have no text shadow in either appearance.

## Layout

Desktop content occupies a left column with a maximum width of 690px. The room remains visible to the right. At widths up to 700px, use 24px side gutters. The scene occupies a 44svh canvas above the form; stage content uses 29vh top padding after the top bar and the introduction uses 34vh. A soft fade into the inherited background separates the scene from foreground text. Keep the full document scrollable on mobile and respect safe areas.

Setup steps open in a compact, collapsible overlay below the top bar. They are not a permanent desktop rail or a horizontal mobile strip. Preserve all 16 stage IDs: intro, preferences, goal, experience, coach, sex, measurements, activity, safety, nutrition, lifestyle, connections, import, assistant, review, and next.

## Elevation & Depth

The pavilion supplies depth through geometry, scanned base-color, normal, and roughness textures, and the Poly Haven Sunset Forest HDR used for the sky/background and PBR reflections. Four floor ambient occlusion maps are baked in Cycles and exported through native glTF occlusion slots with separate UV coordinates. Preserve those maps and their UV assignments when repackaging.

Dynamic illumination combines hemisphere, directional, spotlight, and accent practical lights. Cached shadows use a 2048px directional map and a 1024px spotlight map, refreshed for station changes. Appearance interpolates sky intensity, environment lighting, and materials while retaining scanned surface detail. Tone-mapping exposure is 0.9. This is a real-time rendering approach, not evidence that the requested realism has been achieved.

One camera travels between the stations. Rendering and animation scheduling stop when camera, theme, progress, and busy effects settle, and pause while hidden. Device pixel ratio is capped at 1.25 and active rendering at 60fps. Reduced motion snaps camera, appearance, and progress updates, removes arrival motion, and disables the busy pulse. These implementation properties are not a physical-device performance certification.

During loading or WebGL/asset failure, the inherited background and functional form remain. There is no poster fallback. Desktop shading protects the left form; the mobile fade prevents scene geometry from competing with headings. The step menu uses an ambient shadow and primary controls use restrained depth.

## Shapes

Compact rounded rectangles connect controls without making the scene resemble a card dashboard. Choice controls, primary actions, and panels use the distinct corner sizes in the frontmatter. Thin inherited borders separate controls.

## Components

- **Primary action:** inherited foreground fill and background-colored text, full available width, and a minimum height of 52px.
- **Choice and chip:** inherited surfaces at rest, foreground fill when selected, with semantic pressed or selected state preserved.
- **Fields:** inherited panel surfaces, clear labels, neutral borders, and visible theme-colored keyboard focus.
- **Step menu:** current step is filled; unavailable future steps stay disabled. Opening, closing, and returning to earlier choices preserve the draft.
- **Progress:** 40 physical LED segments across the ring lights track stage progress with the selected identity accent. Keep the accessible foreground progress indicator and textual step count.
- **Scene stations:** nutrition and lifestyle use nutrition; sex, measurements, and safety use recovery; preferences, connections, import, coach, assistant, and review use planning; remaining stages use the movement overview.
- **Review and consent:** retain edit links, import preview before commit, explicit consent, save feedback, errors, and Coach optionality.

## Do's and Don'ts

- **Do** preserve the complete setup and draft recovery behavior when changing presentation.
- **Do** verify both mobile and desktop framing across all four stations.
- **Do** keep reduced motion, visible focus, and functional background fallback usable.
- **Don't** let scene labels or lights compete with foreground text.
- **Don't** replace functional configuration or consent with decorative previews.
- **Don't** imply mock-backend browser checks establish production backend or physical-device performance.

Implementation sources: `../OnboardingMobile.tsx`, `studio-onboarding.css`, `onboarding-scene.tsx`, `../../styles/setup.css`, and repository `scripts/workout-studio/build_pavilion.py`. Product constraints: `../../../PRODUCT.md`. The standalone asset is `apps/mobile/public/onboarding-pavilion/pavilion.glb` (approximately 28.5MB); the Blender source is `scripts/workout-studio/pavilion.blend`. The photographed `forest.hdr` is approximately 7.3MB. Reproducible source fetching is in `scripts/workout-studio/fetch_pavilion_assets.py`, with asset provenance beside the public files. The original workout scene is separate.

Review evidence lives under repository `.impeccable/review/pavilion-*.png` and includes light and dark desktop/mobile captures. Captures may precede this realism rebuild and are not approved comps. The user rejected the prior scene, so the earlier reviewer shipping recommendation does not apply. Previous app typecheck, Vite development build, and 26 onboarding/Coach contract tests passed; verification of the current rebuild is still pending. Do not treat previous browser results as validation of the rebuilt assets or renderer. Realism acceptance and physical-device performance remain unverified, and mocked-backend checks do not establish production backend behavior.

Validation after the rebuild: app typecheck, development build, 26 onboarding/Coach contract tests and 26 mocked-backend WebKit checks passed. A final material-only export received a focused day/night desktop/mobile check. These checks do not certify hyperrealism or physical-device frame rates.

The latest geometry revision uses Poly Haven modular bench slats, modern armchairs and a leather lounge chair with preserved source UVs and material maps. The kettlebells use continuous remeshed bodies and handles. Timber and luminaire cross sections use 20 sides. Honed floor albedo retains scan pores with reduced stain contrast, and the foreground scrim reaches transparency before the main furnishings.

Form panels use theme-tinted frosted glass with a 20px backdrop blur, fine edge highlights and restrained shadows. Choices use a smaller 12px blur. Selected states retain solid foreground/background contrast. Reduced-transparency preference removes blur and restores opaque surfaces. Glass wind screens in the pavilion use a shared physical transmission material, metal clamps and finished top edges; they do not cast opaque runtime shadows.
