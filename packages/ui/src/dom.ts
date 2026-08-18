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
  const [tag, ...classes] = String(tagAndClass).split(".");
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
      Object.assign(el.style, value);
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
