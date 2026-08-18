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
