<!-- SEED: re-run /impeccable document once there's code to capture the actual tokens and components. -->
---
name: Vending 3D Control Agent — Operator Console
description: Remote monitor + control panel for the vending machine's serial hardware channels
---

# Design System: Vending 3D Control Agent — Operator Console

## 1. Overview

**Creative North Star: "The Signal Room"**

An operator sitting at a desk, machine out of sight, reading truth off signals alone: is the vending channel connected, is the navigation-light port answering, is the QR/NFC reader still alive. Nothing here decorates; everything here reports. The system favors a restrained, cool, technical palette — quiet by default so that the one signal that matters (a channel going from connected to reconnecting to down) is the loudest thing on screen when it happens. Per PRODUCT.md, this explicitly rejects generic SaaS-cream marketing surfaces, decorative gradients/glassmorphism, and any status cue that leans on color alone — status must survive a colorblind operator and a glance under bad lighting alike.

**Key Characteristics:**
- Restrained color: tinted cool neutrals, one deep-blue accent for interactive/focus, status states as the only other color voices.
- Single technical sans typeface, no display flourish — this is read repeatedly, not once.
- Responsive motion only: transitions react to real state changes (a channel reconnecting), never orchestrated for its own sake.
- Status is redundant by construction: color + icon/shape + label, always together, never color alone.

## 2. Colors

Restrained strategy: cool tinted neutrals carry the surface; one deep-blue accent marks anything interactive; status states (connected / reconnecting / error / offline) are the only other saturated colors on screen, and each pairs with a non-color cue.

### Primary
- **Signal Blue** (`[to be resolved during implementation]`, deep cobalt/indigo): interactive elements, primary actions, focus rings, links. Used sparingly — this is the one color that means "you can act here."

### Neutral
- **Cool tinted neutrals** (`[to be resolved during implementation]`): body background, surface, borders, dividers, body/label text. Tint chroma toward blue, not warm — no cream/sand/parchment defaults.

### Status Roles (functional, not decorative)
- **Connected / OK** — green, paired with a solid-dot or check icon.
- **Reconnecting / Degraded** — amber, paired with a pulsing or half-filled icon (not a spinner alone).
- **Error / Timeout (504)** — red, paired with an X or alert-triangle icon.
- **Offline / Disconnected** — neutral gray, paired with a dash or hollow-ring icon.
- Exact hex/OKLCH values `[to be resolved during implementation]`.

### Named Rules
**The Restrained Rule.** The accent (Signal Blue) and the four status colors are the only saturated colors in the system. Everything else is neutral. No decorative color.
**The No Color Alone Rule.** Every status state pairs a color with a distinct icon/shape and a text label. Color never carries meaning by itself (WCAG 1.4.1, per PRODUCT.md).

## 3. Typography

**Body/UI Font:** single sans, technical/geometric character (`[font pairing to be chosen at implementation]`)
**Label/Mono Font:** monospace for raw values — port names, hex payloads, timestamps, baud rates (`[font pairing to be chosen at implementation]`)

**Character:** Legible at small sizes and dense layouts, no warmth-by-decoration — reads as an instrument, not a brand.

### Hierarchy
- **Title**: section/page headers (channel names: Vending, Navigation Lights, QR/NFC).
- **Body**: standard UI text, labels, descriptions.
- **Label**: status chips, table headers — likely uppercase, tracked, small.
- **Mono/Data**: raw serial values, port paths, hex payloads, timestamps — always monospace so byte-level data doesn't get mistaken for prose.

### Named Rules
**The Instrument Rule.** No display/hero-scale type anywhere in this system — this is a working panel, not a landing page.

## 4. Elevation

Flat by default, per the Restrained color strategy and Responsive motion energy — depth is conveyed through neutral surface layering (subtly distinct background tones for panel vs. card vs. page), not shadow. Shadows, if used at all, appear only as a direct response to state (e.g. a modal confirming a manual write action), never as ambient decoration.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadow appears only for transient overlays (confirmation dialogs on hardware-affecting actions), never on static cards or panels.

## 5. Components

No component library exists yet — this project is pre-implementation. Canonical primitives (status chip, channel card, action button, confirmation dialog) will be synthesized from these tokens on the first real build (`/impeccable craft` or the next `/impeccable document` scan-mode pass).

## 6. Do's and Don'ts

### Do:
- **Do** pair every status color with a non-color cue (icon/shape + label) — per PRODUCT.md's accessibility requirement.
- **Do** show raw hardware truth (port, baud, last activity, reconnect attempts) in monospace, not a simplified green/red abstraction.
- **Do** require explicit confirmation before firing any manual write/dispense action, and always show the result (success, timeout/504, error) plainly.
- **Do** keep the accent (Signal Blue) rare — reserved for interactive elements only.

### Don't:
- **Don't** use generic SaaS-cream/gradient-hero marketing aesthetics — this is a working ops tool, not a landing page (per PRODUCT.md anti-references).
- **Don't** use decorative glassmorphism or gradient text.
- **Don't** use cute/playful consumer styling that undersells the seriousness of controlling physical hardware.
- **Don't** signal status with color alone.
- **Don't** use `border-left`/`border-right` colored stripes as a status affordance — use full borders, background tints, or icon-led rows instead.
