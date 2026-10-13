# Vocabulary — Titik

## Simple Terms

**SF Trio**: Apple's native San Francisco typography triad (`SF Pro`, `SF Pro Rounded`, `SF Mono`) yang menjadi fondasi typography system Titik. → `Theme.swift` @ `TitikUI`

**Selection Pill**: Spring-animated `RoundedRectangle` yang bergerak vertikal mengikuti focused search result, diimplementasi sebagai background plate layer terpisah dari row content. → `ResultsListView` @ `TitikUI`

**Dynamic Plugin**: Native Swift `.titikplugin` bundle (loadable bundle format) yang conform ke protokol `TitikPlugin` atau `TitikStreamingPlugin`. Entrypoint via `NSPrincipalClass` di `Info.plist`, didiscovery dari `~/.config/titik/plugins/` dan app `PlugIns/`. Catatan: pendekatan C ABI / `.dylib` sudah deprecated (ADR 3). → `PluginManager`, `PluginHost` @ `TitikPlugins`, `TitikPlugin` @ `TitikPluginKit`

## Design & Architecture Terms

### Liquid Glass

**What it is**: Apple's native system-rendered material, applied in Titik through SwiftUI `glassEffect` on macOS 26+ (decision updated 2026-10-03).

**Invariants**:
- Use the real Apple API; the system owns material rendering.
- Reserve native effect clearance in window/content geometry.
- Use an explicitly opaque fallback on older macOS versions and when Reduce Transparency is active; that fallback is not Liquid Glass.

**Anti-Patterns**:
- Calling NSVisualEffectView vibrancy or a simulated blur/gradient/tint/shadow stack Liquid Glass.
- Adding manual shadows or ornamental layers to imitate the native material.
- Labeling an opaque fallback as Liquid Glass.

**Source**: ADR 6; user correction on 2026-10-03; [Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views); [Apple HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials).
