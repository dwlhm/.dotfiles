---
name: ui-contrast
description: >
  When designing or implementing UI elements that render text over dynamic
  backgrounds, wallpapers, or arbitrary image surfaces — contrast tokens,
  shadow specs, and layering rules for typography legibility.
---

# UI Contrast & Typography Legibility

When designing and implementing UI elements that render over dynamic
backgrounds, wallpapers, or arbitrary image surfaces:

1. **Guaranteed Contrast on Typography**:
   - Plain text directly over dynamic backgrounds is strictly prohibited without
     a contrast preservation mechanism (shadow token or container backdrop).
   - Use centralized design tokens for text shadows or equivalent platform-specific
     contrast mechanisms.

2. **Shadow Token Specifications**:
   - Standard list labels: shadow with `alpha ~0.60`, offset `0,2`, blur radius `~8`
   - Large display/headers: shadow with `alpha ~0.60`, offset `0,3`, blur radius `~12`
   - Adapt these values to the platform's shadow API (Jetpack Compose, CSS, SwiftUI, etc.)

3. **Layering & Composition**:
   - Combine text shadows with background scrims for optimal readability without
     losing background aesthetics.
   - Maintain token encapsulation inside the design system theme layer to prevent
     ad-hoc inline color mutations.

This rule applies when the project renders UI over non-solid or dynamic surfaces.
Projects with solid/opaque backgrounds are exempt.
