/**
 * Per-destination glyph + badge colour for the bottom navigation dock.
 *
 * Glyphs are plain emoji text — never a fetched asset, never an <img> — so
 * the dock stays fully offline and bundles cleanly. Each destination gets
 * its own saturated badge colour (defined as CSS custom properties in
 * ./nav.css) so the dock reads as a row of distinct game buttons rather
 * than a uniform list of rows, which is the whole point of replacing the
 * sidebar.
 */

export interface NavDockGlyph {
  /** Emoji glyph rendered inside the badge. Marked aria-hidden by the
   * button that uses it — the visible label text carries the accessible
   * name instead, so screen readers get "Fields", not "sheaf of rice
   * Fields". */
  glyph: string;
  /** CSS custom property name (defined in nav.css) used as the badge's
   * background colour. */
  colorVar: string;
}

const DEFAULT_GLYPH: NavDockGlyph = { glyph: "•", colorVar: "--mm-nav-badge-slate" };

const GLYPHS: Record<string, NavDockGlyph> = {
  fields: { glyph: "🌾", colorVar: "--mm-nav-badge-grass" },
  factories: { glyph: "🏭", colorVar: "--mm-nav-badge-coal" },
  barn: { glyph: "🐄", colorVar: "--mm-nav-badge-wood" },
  orders: { glyph: "📦", colorVar: "--mm-nav-badge-gold" },
  train: { glyph: "🚂", colorVar: "--mm-nav-badge-brick" },
  helicopter: { glyph: "🚁", colorVar: "--mm-nav-badge-sky" },
  ship: { glyph: "🚢", colorVar: "--mm-nav-badge-ocean" },
  town: { glyph: "🏘️", colorVar: "--mm-nav-badge-clay" },
  zoo: { glyph: "🦓", colorVar: "--mm-nav-badge-jungle" },
  mine: { glyph: "⛏️", colorVar: "--mm-nav-badge-coal" },
  museum: { glyph: "🏛️", colorVar: "--mm-nav-badge-marble" },
  achievements: { glyph: "🏆", colorVar: "--mm-nav-badge-gold" },
  dailies: { glyph: "📋", colorVar: "--mm-nav-badge-berry" },
  village: { glyph: "🏡", colorVar: "--mm-nav-badge-clay" },
  settings: { glyph: "⚙️", colorVar: "--mm-nav-badge-slate" },
  "control-centre": { glyph: "🎛️", colorVar: "--mm-nav-badge-plum" },
};

export function navGlyphFor(id: string): NavDockGlyph {
  return GLYPHS[id] ?? DEFAULT_GLYPH;
}
