# Material Design 3 token system

## Behaviour

`packages/ui/src/tokens.css` defines the complete Material Design 3 token set
as CSS custom properties on `:root`: colour roles, the full type scale, shape
scale, elevation recipes, motion durations/easings, spacing, and state-layer
opacities. Every component in `packages/ui/src/components/` and every panel
reads exclusively from these tokens — no component hard-codes a colour,
radius, duration, or font size.

`tokens.ts` provides typed string constants for each token name so component
code never risks a typo'd `var(--mm-...)` string, plus small runtime helpers:
`setTheme()`, `setDensityScale()`, `cssVar()`, `readCssVar()`.

## Light and dark themes

The complete light palette is defined first, directly on bare `:root`, so it
is never dependent on a media query or attribute matching. Dark values are
then defined twice, deliberately:

1. Inside `@media (prefers-color-scheme: dark)`, scoped to
   `:root:not([data-theme="light"])` — this applies when the OS/browser
   prefers dark and the user has not explicitly chosen light.
2. Under `:root[data-theme="dark"]` — this wins regardless of the OS setting,
   for a user who explicitly chose dark in Settings → General.

This two-layer approach means every token has a real value in both themes in
both directions (an explicit choice always overrides the system preference),
and no token's only definition lives inside a conditional block.

## Configuration

Runtime-adjustable via Settings → Appearance: accent/seed hue, font family,
font size scale, font weight, density. Settings → General exposes the theme
selector (system / light / dark), which calls `setTheme()`.

## Failure modes

- A component CSS rule with a literal colour or size instead of a token is a
  design-system regression; review diffs for hard-coded values.
- `prefers-reduced-motion: reduce` collapses all motion durations to 1ms —
  verify animated components (super-confirm progress bar, toasts, command
  palette highlight) do not depend on a specific non-zero duration to function.

## Verification

Manual: toggle Settings → General → Theme between System, Light and Dark with
the OS set to both light and dark, and confirm every surface (HUD, panels,
dialogs, menus, toasts) renders with real, legible colours in all four
combinations, never a transparent or undefined value.

Evidence status: this is a prescribed manual procedure. The sole packaged
capture from `c328d7d` shows one dark surface state; it is not light/dark,
contrast, density, high-scale, or full-component proof.

## Security considerations

Appearance input must remain presentation-only. It must not alter package
identity, data locations, update configuration, accessible names, or factual
status values, and imported theme data requires bounded validation.

## Suggested articles

- [Settings](./settings.md)
- [Logo customization pipeline](./platform-services/logo-customization.md)
- [Overlays and context menus](./overlays-and-menus.md)
