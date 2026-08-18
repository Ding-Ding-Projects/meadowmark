# Meadowmark design system

Source-of-truth for the Meadowmark landing site's Material Design 3 system.

- `tokens/tokens.css` — canonical token source (identical copy in `css/tokens.css`,
  which the preview pages link against; the site itself uses `site/css/tokens.css`,
  kept in sync with this file).
- `css/` — the site's three stylesheets, mirrored here so the standalone preview
  pages in `components/` can link to them without reaching outside `design/`.
- `components/*.html` — standalone, openable-on-their-own preview pages, one per
  group. Each starts with `<!-- @dsCard group="..." -->` so it registers as a
  design-system card. Groups: Colour, Type, Elevation, Shape, Motion, Components,
  Brand.
- `tools/generate-tonal-palettes.py` — derives the five HSL-based tonal ramps
  (primary/secondary/tertiary/neutral/neutral-variant) the whole system is built
  from.
- `tools/build-tokens.py` — applies the M3 baseline tone→role assignments to
  those ramps for light and dark, and prints a collision report: which roles
  legitimately share a hex value by M3 design, and — the important part — proof
  that the specific pairs this pass exists to fix (bg vs card, surface-variant
  vs outline-variant, primary vs accent) come out different.
- `tools/contrast-check.py` — WCAG contrast check used to pick the light-mode
  primary/secondary tones (M3's usual tone 40 fails 4.5:1 against white text at
  this system's saturation, so primary uses tone 38 and secondary tone 35).

Keeping `design/css/*` and `site/css/*` in sync is manual (`cp site/css/*.css
design/css/`) — there's no build step wiring them together, so a change to one
does not automatically reach the other. Always edit `site/css/tokens.css` (the
one the live site actually serves) first, then copy it into `design/`.
