/**
 * TypeScript-side handles for the CSS custom properties defined in tokens.css.
 * Use these instead of hard-coding `var(--mm-...)` strings so a rename is a
 * one-place edit and typos are caught at compile time.
 */

export const colorToken = {
  primary: "--mm-color-primary",
  onPrimary: "--mm-color-on-primary",
  primaryContainer: "--mm-color-primary-container",
  onPrimaryContainer: "--mm-color-on-primary-container",
  secondary: "--mm-color-secondary",
  onSecondary: "--mm-color-on-secondary",
  secondaryContainer: "--mm-color-secondary-container",
  onSecondaryContainer: "--mm-color-on-secondary-container",
  tertiary: "--mm-color-tertiary",
  onTertiary: "--mm-color-on-tertiary",
  tertiaryContainer: "--mm-color-tertiary-container",
  onTertiaryContainer: "--mm-color-on-tertiary-container",
  error: "--mm-color-error",
  onError: "--mm-color-on-error",
  errorContainer: "--mm-color-error-container",
  onErrorContainer: "--mm-color-on-error-container",
  warning: "--mm-color-warning",
  onWarning: "--mm-color-on-warning",
  warningContainer: "--mm-color-warning-container",
  onWarningContainer: "--mm-color-on-warning-container",
  success: "--mm-color-success",
  onSuccess: "--mm-color-on-success",
  successContainer: "--mm-color-success-container",
  onSuccessContainer: "--mm-color-on-success-container",
  background: "--mm-color-background",
  onBackground: "--mm-color-on-background",
  surface: "--mm-color-surface",
  onSurface: "--mm-color-on-surface",
  surfaceVariant: "--mm-color-surface-variant",
  onSurfaceVariant: "--mm-color-on-surface-variant",
  surfaceDim: "--mm-color-surface-dim",
  surfaceBright: "--mm-color-surface-bright",
  surfaceContainerLowest: "--mm-color-surface-container-lowest",
  surfaceContainerLow: "--mm-color-surface-container-low",
  surfaceContainer: "--mm-color-surface-container",
  surfaceContainerHigh: "--mm-color-surface-container-high",
  surfaceContainerHighest: "--mm-color-surface-container-highest",
  outline: "--mm-color-outline",
  outlineVariant: "--mm-color-outline-variant",
  inverseSurface: "--mm-color-inverse-surface",
  inverseOnSurface: "--mm-color-inverse-on-surface",
  inversePrimary: "--mm-color-inverse-primary",
  shadow: "--mm-color-shadow",
  scrim: "--mm-color-scrim",
} as const;

/**
 * Game colour families: raw hues for a badge, dock icon, or capsule that
 * needs a colour outside the semantic primary/secondary/tertiary roles.
 * Each family has a light/base/dark step (base = fill, dark = the solid-drop
 * bottom edge that base composes against).
 */
export const gameColorToken = {
  grassLight: "--mm-color-grass-light",
  grass: "--mm-color-grass",
  grassDark: "--mm-color-grass-dark",
  goldLight: "--mm-color-gold-light",
  gold: "--mm-color-gold",
  goldDark: "--mm-color-gold-dark",
  amberLight: "--mm-color-amber-light",
  amber: "--mm-color-amber",
  amberDark: "--mm-color-amber-dark",
  tomatoLight: "--mm-color-tomato-light",
  tomato: "--mm-color-tomato",
  tomatoDark: "--mm-color-tomato-dark",
  skyLight: "--mm-color-sky-light",
  sky: "--mm-color-sky",
  skyDark: "--mm-color-sky-dark",
  woodLight: "--mm-color-wood-light",
  wood: "--mm-color-wood",
  woodDark: "--mm-color-wood-dark",
  cream: "--mm-color-cream",
  parchment: "--mm-color-parchment",
} as const;

/** Paired linear-gradient stops for glossy capsule/badge fills. */
export const gradientToken = {
  grassStart: "--mm-gradient-grass-start",
  grassEnd: "--mm-gradient-grass-end",
  goldStart: "--mm-gradient-gold-start",
  goldEnd: "--mm-gradient-gold-end",
  amberStart: "--mm-gradient-amber-start",
  amberEnd: "--mm-gradient-amber-end",
  tomatoStart: "--mm-gradient-tomato-start",
  tomatoEnd: "--mm-gradient-tomato-end",
  skyStart: "--mm-gradient-sky-start",
  skyEnd: "--mm-gradient-sky-end",
  woodStart: "--mm-gradient-wood-start",
  woodEnd: "--mm-gradient-wood-end",
  parchmentStart: "--mm-gradient-parchment-start",
  parchmentEnd: "--mm-gradient-parchment-end",
} as const;

/** Chunky corner-radius scale for round/squircle game furniture. */
export const radiusToken = {
  sm: "--mm-radius-sm",
  md: "--mm-radius-md",
  lg: "--mm-radius-lg",
  xl: "--mm-radius-xl",
  full: "--mm-radius-full",
} as const;

/** Border-width scale; every game panel/button/capsule border is at least "thick". */
export const borderToken = {
  hairline: "--mm-border-hairline",
  thin: "--mm-border-thin",
  thick: "--mm-border-thick",
  heavy: "--mm-border-heavy",
} as const;

/**
 * Solid-drop and ambient shadow recipes. The -sm/-md/-lg drop shadows are
 * the physical "bottom edge" a chunky button or capsule needs; the ambient
 * shadows are the soft ground shadow a floating panel casts; -panel/-card
 * combine both into one ready-to-use box-shadow value.
 */
export const shadowToken = {
  dropColor: "--mm-shadow-drop-color",
  dropOffsetSm: "--mm-shadow-drop-offset-sm",
  dropOffsetMd: "--mm-shadow-drop-offset-md",
  dropOffsetLg: "--mm-shadow-drop-offset-lg",
  dropSm: "--mm-shadow-drop-sm",
  dropMd: "--mm-shadow-drop-md",
  dropLg: "--mm-shadow-drop-lg",
  ambientSm: "--mm-shadow-ambient-sm",
  ambientMd: "--mm-shadow-ambient-md",
  ambientLg: "--mm-shadow-ambient-lg",
  panel: "--mm-shadow-panel",
  card: "--mm-shadow-card",
  insetHighlight: "--mm-shadow-inset-highlight",
  insetHighlightStrong: "--mm-shadow-inset-highlight-strong",
} as const;

/** Heavy font weights for anything a player reads at a glance. */
export const fontWeightToken = {
  regular: "--mm-font-weight-regular",
  medium: "--mm-font-weight-medium",
  bold: "--mm-font-weight-bold",
  heavy: "--mm-font-weight-heavy",
} as const;

/** Larger, bolder type roles for panel titles, button labels, and HUD numerals. */
export const gameTypeScaleToken = {
  panelTitle: "panel-title",
  buttonLabel: "button-label",
  buttonLabelLarge: "button-label-large",
  hudValue: "hud-value",
  hudValueLarge: "hud-value-large",
  dockLabel: "dock-label",
} as const;

export type GameTypeScaleRole = (typeof gameTypeScaleToken)[keyof typeof gameTypeScaleToken];

/** Minimum control heights for chunky, tactile buttons and dock icons. */
export const controlHeightToken = {
  button: "--mm-control-height-button",
  buttonLarge: "--mm-control-height-button-lg",
  dockIcon: "--mm-control-height-dock-icon",
} as const;

export const typeScaleToken = {
  displayLarge: "display-large",
  displayMedium: "display-medium",
  displaySmall: "display-small",
  headlineLarge: "headline-large",
  headlineMedium: "headline-medium",
  headlineSmall: "headline-small",
  titleLarge: "title-large",
  titleMedium: "title-medium",
  titleSmall: "title-small",
  labelLarge: "label-large",
  labelMedium: "label-medium",
  labelSmall: "label-small",
  bodyLarge: "body-large",
  bodyMedium: "body-medium",
  bodySmall: "body-small",
} as const;

export type TypeScaleRole = (typeof typeScaleToken)[keyof typeof typeScaleToken];

export const shapeToken = {
  none: "--mm-shape-none",
  extraSmall: "--mm-shape-extra-small",
  small: "--mm-shape-small",
  medium: "--mm-shape-medium",
  large: "--mm-shape-large",
  extraLarge: "--mm-shape-extra-large",
  full: "--mm-shape-full",
} as const;

export const elevationToken = {
  level0: "--mm-elevation-0",
  level1: "--mm-elevation-1",
  level2: "--mm-elevation-2",
  level3: "--mm-elevation-3",
  level4: "--mm-elevation-4",
  level5: "--mm-elevation-5",
} as const;

export const motionDurationToken = {
  short1: "--mm-motion-duration-short1",
  short2: "--mm-motion-duration-short2",
  short3: "--mm-motion-duration-short3",
  short4: "--mm-motion-duration-short4",
  medium1: "--mm-motion-duration-medium1",
  medium2: "--mm-motion-duration-medium2",
  medium3: "--mm-motion-duration-medium3",
  medium4: "--mm-motion-duration-medium4",
  long1: "--mm-motion-duration-long1",
  long2: "--mm-motion-duration-long2",
  long3: "--mm-motion-duration-long3",
  long4: "--mm-motion-duration-long4",
} as const;

export const motionEasingToken = {
  standard: "--mm-motion-easing-standard",
  standardAccelerate: "--mm-motion-easing-standard-accelerate",
  standardDecelerate: "--mm-motion-easing-standard-decelerate",
  emphasized: "--mm-motion-easing-emphasized",
} as const;

export const spaceToken = {
  0: "--mm-space-0",
  1: "--mm-space-1",
  2: "--mm-space-2",
  3: "--mm-space-3",
  4: "--mm-space-4",
  5: "--mm-space-5",
  6: "--mm-space-6",
  8: "--mm-space-8",
  10: "--mm-space-10",
  12: "--mm-space-12",
  16: "--mm-space-16",
} as const;

export function cssVar(token: string, fallback?: string): string {
  return fallback ? `var(${token}, ${fallback})` : `var(${token})`;
}

/** Reads a CSS custom property's resolved value from a given element (defaults to :root). */
export function readCssVar(token: string, el: HTMLElement = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(token).trim();
}

export function setTheme(theme: "light" | "dark" | "system"): void {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

export function setDensityScale(scale: number): void {
  document.documentElement.style.setProperty("--mm-density-scale", String(scale));
}
