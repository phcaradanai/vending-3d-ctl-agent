# Product

## Register

product

## Users

Remote operators/admins managing one or more vending machines from a desk — not on-site technicians standing next to the hardware. They can't see the machine, so the interface is their only signal for whether serial hardware (vending, navigation lights, QR/NFC reader) is alive, connected, and behaving. Primary job: glance at machine health, spot a stuck/disconnected port fast, and issue manual writes/tests (dispense, navigation-light commands) without touching a terminal or curl.

## Product Purpose

A monitor + control panel for the existing `vending-3d-ctl-agent` API: surfaces live health/status for the three serial channels (vending, navigation-lights, QR/NFC) via `GET /api/v1/health`, and exposes manual write/test controls that map directly to `POST /api/v1/serial/vending/write`, `POST /api/v1/serial/navigation-lights/write`, and the QR/NFC MQTT stream. Success = an operator can tell within seconds whether a machine is healthy, and can safely trigger a test write/dispense without ambiguity about what happened.

## Brand Personality

Precise, trustworthy, calm — an ops/NOC dashboard, not a consumer app. Status must read as unambiguous at a glance: connected vs. reconnecting vs. down should never require hovering or guessing. Density and clarity over decoration; this is a tool operators trust with hardware they can't see, not a showcase.

## Anti-references

No specific named references given. Avoid: generic SaaS-cream/gradient-hero marketing aesthetics (this isn't a landing page), decorative glassmorphism or gradient text, cute/playful consumer styling that undersells the seriousness of controlling physical hardware, and any status affordance that relies on color alone.

## Design Principles

1. **Status is unambiguous** — every serial channel's state (connected / reconnecting / disconnected / error) is legible in under a second, with redundant non-color cues (icon/shape/label), never color alone.
2. **Show hardware truth, not just app state** — surface what `getSerialHealthSnapshot` actually reports (port, baud, last activity, reconnect attempts), not a simplified green/red abstraction that hides failure detail.
3. **Manual controls are deliberate, not accidental** — write/dispense/test actions are hardware-affecting and irreversible on physical devices; confirm before firing, and always show the result (success, timeout/504, error) plainly.
4. **Density over decoration** — this is a working ops tool used repeatedly, not browsed once. Favor scanability and information density appropriate to a remote-monitoring context over visual flourish.
5. **Remote-first** — designed for an operator who cannot see or touch the machine; every piece of state shown must answer "is it actually working right now."

## Accessibility & Inclusion

Standard WCAG AA baseline (contrast, keyboard navigation, screen-reader labeling). Given the hardware-status nature of this UI, status indicators (online/offline/error/reconnecting) must not rely on color alone — pair color with icon/shape/text per WCAG 1.4.1.
