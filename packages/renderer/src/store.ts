/**
 * A tiny observable store. @meadowmark/ui's mountUi() wants a
 * `ReadonlyStore<GameStateView>` (getSnapshot + subscribe); this wraps a
 * mutable GameState plus a derived-view mapper so the renderer's tick loop
 * has one place to push new state from.
 */

import type { ReadonlyStore } from '@meadowmark/ui';

export class Store<T> implements ReadonlyStore<T> {
  private value: T;
  private readonly listeners = new Set<(value: T) => void>();

  constructor(initial: T) {
    this.value = initial;
  }

  getSnapshot(): T {
    return this.value;
  }

  set(next: T): void {
    this.value = next;
    for (const listener of this.listeners) listener(next);
  }

  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
