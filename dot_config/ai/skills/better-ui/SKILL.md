---
name: better-ui
description: >-
  Framework-agnostic UI visual craft and micro-polish rules (concentric border radius
  geometry, optical alignment, layered surface shadows, icon stroke-to-font weight
  parity, hit targets, and 10%-speed animation verification) across Native (SwiftUI,
  AppKit, Odin desktop/GUI/TUI) and Web. Activate ONLY when the user explicitly requests
  UI craft review or visual polish (e.g. 'pakai better-ui', 'audit UI', 'polish visual'),
  or during a dedicated UI finishing phase. DO NOT activate for routine backend/system
  coding, logic implementation, or non-UI tasks.
---

# Better UI (`better-ui`)

Framework-agnostic guidelines for micro-polish, optical craft, and tactile fidelity. Applied across Native macOS (SwiftUI/AppKit), Native Desktop/Odin/TUI, and Web.

---

## 1. Concentric Radii Geometry

Nested containers sharing an inset or padding must have concentric rounding. Giving outer and inner containers the same radius causes "fighting corners" and awkward margin pinching.

* **Formula**:
  $$\text{Radius}_{\text{outer}} = \text{Radius}_{\text{inner}} + \text{Padding} + \text{BorderWidth}$$
  $$\text{Radius}_{\text{inner}} = \max(0, \text{Radius}_{\text{outer}} - \text{Padding} - \text{BorderWidth})$$
* **Decoupling Threshold**: When padding $\ge 24\text{px}$, corner contours visually decouple and can use standard token radii.
* **Platform Application**:
  * **SwiftUI**: Outer container `.clipShape(RoundedRectangle(cornerRadius: r_out))` wrapping inner element `.clipShape(RoundedRectangle(cornerRadius: max(0, r_out - padding)))`.
  * **Odin / Native GUI**: Calculate physical pixel curves using the formula before rasterizing or submitting vertices.
  * **Web/CSS**: Use `calc(var(--parent-radius) - var(--padding))` for inner elements.

---

## 2. Optical vs. Geometric Alignment

Human vision perceives visual weight, not bounding boxes.

* **Asymmetric Shapes (e.g., Play Button)**: A triangle inside a circle must be shifted forward by $\approx 1/10$ to $1/12$ of its width because its center of mass sits behind its geometric bounding box center.
* **Badge & Indicator Placement**: Place corner badges so their optical center aligns with the parent element's boundary stroke, not its outer margin.
* **Text & Icon Baseline Balance**:
  * With capital text: Center icon optically to the Cap Height ($H_{\text{cap}}$), not the full line height ($H_{\text{line}}$).
  * With lowercase text: Offset icon vertically by 1–2 physical pixels if the line has heavy descenders.

---

## 3. Surface Depth, Elevation & Contrast

Avoid muddy single-layer drop shadows.

* **Dual-Layer Shadows (Light Mode)**:
  1. *Key Light (Form definition)*: Small blur (2–4px), clear vertical offset (1–2px), higher opacity ($\approx 10\text{–}15\%$).
  2. *Ambient Light (Elevation)*: Large blur (12–24px), moderate vertical offset (4–12px), subtle opacity ($\approx 4\text{–}8\%$).
* **Dark Mode Depth**:
  * Shadows are largely invisible on dark backgrounds.
  * Use **Surface Tint** (lighter background brightness for higher elevations) + **1px Inset Border** (subtle white stroke with $6\text{–}12\%$ opacity) to define surfaces.
  * In SwiftUI: `.overlay(RoundedRectangle(...).stroke(Color.white.opacity(0.08), lineWidth: 1))`.

---

## 4. Typography & Iconography Parity

Icons and typography must share visual weight and stroke characteristics.

* **Stroke Weight Matching**:
  * Regular font (400) $\to$ $1.5\text{px}$ icon stroke.
  * Medium / Semibold font (500–600) $\to$ $2.0\text{px}$ icon stroke.
  * Bold font (700+) $\to$ $2.5\text{px}$ or filled icon style.
* **Hit Targets vs. Visual Bounding Box**:
  * Minimum touch/click target is $44 \times 44\text{pt}$ (Apple HIG) or $48 \times 48\text{px}$ (Material/Web).
  * If a button icon is $16 \times 16\text{px}$, expand its invisible interactive frame without enlarging the icon glyph.

---

## 5. Tactile Interaction & Motion Inspection

Interfaces must feel responsive and physically grounded.

* **Press Scale Feedback**:
  * On press/active, scale interactive elements down slightly ($0.96\text{–}0.98$) with a swift duration ($100\text{–}150\text{ms}$).
  * Use interruptible spring physics rather than rigid, uncancelable linear easing.
* **The 10% Speed Test**:
  * Replay transitions and layout state changes at $10\%$ speed.
  * Check: Does any element snap before its transition finishes? Are text scales blurry during interpolation? Do nested borders clip abruptly?
* **Exit Faster Than Entrance**: Exit animations should be $20\text{–}30\%$ faster than entrance animations to keep the UI snappy.

---

## 6. Audit Checklist

When reviewing UI polish:
- [ ] Are nested corner radii strictly concentric?
- [ ] Are asymmetrical icons optically balanced?
- [ ] Does elevation use multi-layer or stroke-defined depth instead of single blurry shadows?
- [ ] Do icon stroke weights match their adjacent text weight?
- [ ] Are interactive hit targets $\ge 44\text{pt}$ even if the visual element is smaller?
- [ ] Does motion pass the 10% slow-motion inspection without visual jank?
