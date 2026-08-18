/**
 * Minimal DOM construction helpers. Deliberately dependency-free (no React,
 * no virtual DOM) so the UI package stays light and bundles offline cleanly.
 */

export type Child = Node | string | null | undefined | false;

export interface ElAttrs {
  [key: string]: string | number | boolean | undefined | ((ev: any) => void) | Record<string, string>;
}

/** Hyperscript-ish element factory: h("button.mm-btn", { onclick: fn }, "Label"). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tagAndClass: K | `${K}.${string}`,
  attrs: ElAttrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const parts = String(tagAndClass).split(".");
  // `parts[0]` is always present for a non-empty split() result, but
  // noUncheckedIndexedAccess types it as possibly undefined — fall back to
  // "div" as a documented, harmless default rather than casting past it.
  const tag = parts[0] ?? "div";
  const classes = parts.slice(1);
  const el = document.createElement(tag) as HTMLElementTagNameMap[K];
  if (classes.length) el.className = classes.join(" ");
  if (attrs) applyAttrs(el, attrs);
  appendChildren(el, children);
  return el;
}

export function applyAttrs(el: HTMLElement, attrs: ElAttrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === "style" && typeof value === "object") {
      // `Object.assign(el.style, value)` only works for the standard,
      // pre-declared CSSStyleDeclaration properties (e.g. `color`) — those
      // have real setters. A CSS custom property name like
      // "--mm-navdock-badge-color" has no such setter, so assigning it as
      // a plain property is a silent no-op: it never reaches the actual
      // style declaration, and every caller passing a custom property
      // this way (the nav dock's per-destination badge colour, notably)
      // was left permanently on its CSS fallback value instead. Route
      // custom properties through `setProperty`, which is the only API
      // that actually sets them, and leave standard properties on the
      // fast assignment path.
      for (const [prop, propValue] of Object.entries(value)) {
        if (propValue === undefined) continue;
        if (prop.startsWith("--")) el.style.setProperty(prop, String(propValue));
        else (el.style as unknown as Record<string, string>)[prop] = String(propValue);
      }
    } else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === "class" || key === "className") {
      el.className = String(value);
    } else if (key === "value" && "value" in el) {
      (el as any).value = value;
    } else if (typeof value === "boolean") {
      if (value) el.setAttribute(key, "");
      else el.removeAttribute(key);
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

export function appendChildren(el: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function replaceChildren(el: Element, children: Child[]): void {
  clear(el);
  appendChildren(el, children);
}

/** Simple pub/sub store used across the UI for local (non-game) reactive state. */
export class Store<T> {
  private value: T;
  private listeners = new Set<(value: T) => void>();

  constructor(initial: T) {
    this.value = initial;
  }

  getSnapshot(): T {
    return this.value;
  }

  set(value: T): void {
    this.value = value;
    for (const listener of this.listeners) listener(value);
  }

  update(fn: (value: T) => T): void {
    this.set(fn(this.value));
  }

  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Binds a store to a render function, calling it immediately and on every change. Returns a disposer. */
export function bind<T>(store: { getSnapshot(): T; subscribe(l: (v: T) => void): () => void }, render: (value: T) => void): () => void {
  render(store.getSnapshot());
  return store.subscribe(render);
}

let uidCounter = 0;
export function uid(prefix = "mm"): string {
  uidCounter += 1;
  return `${prefix}-${uidCounter}-${Date.now().toString(36)}`;
}

/** Preserves keyboard focus across a bounded live-region rebuild. This is a
 * compatibility bridge for ticking panels until their timers are fully
 * incremental; it prevents the one-second DOM refresh from ejecting focus. */
export function preserveFocusedDescendant(container: HTMLElement, mutate: () => void): void {
  const selector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const before = [...container.querySelectorAll<HTMLElement>(selector)];
  const active = document.activeElement instanceof HTMLElement && container.contains(document.activeElement) ? document.activeElement : null;
  const index = active ? before.indexOf(active) : -1;
  mutate();
  if (index < 0) return;
  const after = [...container.querySelectorAll<HTMLElement>(selector)];
  after[Math.min(index, after.length - 1)]?.focus({ preventScroll: true });
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.ceil(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatCompactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Reads the OS-level reduced-motion preference. Every animated affordance in
 * this package must check this (or rely on tokens.css's global motion-duration
 * override) before playing a non-essential transform/opacity animation. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/**
 * Tweens a number from `from` to `to` over `durationMs`, calling `apply` on
 * every animation frame with the interpolated value (eased, decelerating).
 * Jumps straight to the final value with no animation when the value has not
 * changed or the user prefers reduced motion — this is a readability aid,
 * never a fact, so it must never delay the real number reaching the screen.
 */
export function animateValue(from: number, to: number, durationMs: number, apply: (value: number) => void): void {
  if (from === to || prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
    apply(to);
    return;
  }
  const start = performance.now();
  function frame(now: number): void {
    const progress = clamp((now - start) / durationMs, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    apply(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
