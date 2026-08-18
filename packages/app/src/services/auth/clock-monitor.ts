/**
 * TOTP codes are computed entirely from the system clock (there is no
 * network time source in this app, and there must never be one — see
 * the project's no-network rule). If that clock is wrong, every code
 * this app shows will be silently wrong too: rejected by every real
 * service, with nothing in this app's own UI ever hinting why.
 *
 * This module cannot tell whether the ABSOLUTE system clock is correct
 * — that would require a trusted external time source, which the app is
 * not allowed to reach. What it CAN do, honestly and without a network
 * call, is notice when the wall clock changes discontinuously relative
 * to a monotonic clock that a manual date change or a large NTP
 * correction cannot affect: if wall-clock time jumps by more than the
 * monotonic clock says elapsed, something changed the system clock out
 * from under this process. That is a real, useful signal — "the clock
 * was just changed, possibly by a lot" — and it is reported for exactly
 * what it is, not oversold as "the clock is currently correct".
 */

import { performance } from 'node:perf_hooks';

export type ClockStatus =
  | { state: 'ok' }
  | { state: 'jumped'; observedDriftMs: number; detectedAt: string }
  | { state: 'unknown'; reason: string };

/** Any wall-clock/monotonic-clock divergence smaller than this is normal
 * scheduling jitter (GC pauses, OS scheduling, a suspended laptop lid
 * very briefly) and is not reported as a jump. 5 seconds is well beyond
 * ordinary jitter and well inside "someone or something changed the
 * clock". */
const JUMP_THRESHOLD_MS = 5000;

export class ClockMonitor {
  private readonly now: () => number;
  private readonly monotonicNow: () => number;
  private lastWallClockMs: number;
  private lastMonotonicMs: number;
  private lastJump: { observedDriftMs: number; detectedAt: string } | null = null;

  constructor(
    now: () => number = Date.now,
    monotonicNow: () => number = () => performance.now(),
  ) {
    this.now = now;
    this.monotonicNow = monotonicNow;
    this.lastWallClockMs = this.now();
    this.lastMonotonicMs = this.monotonicNow();
  }

  /**
   * Samples the current clocks, compares the elapsed time on each since
   * the previous sample, and records a jump if they disagree by more
   * than the threshold. Call this before generating or verifying a code
   * so the status reflects the freshest possible reading, not just the
   * reading taken when the monitor was constructed.
   */
  sample(): void {
    const wallClockNow = this.now();
    const monotonicNowValue = this.monotonicNow();

    const wallElapsed = wallClockNow - this.lastWallClockMs;
    const monotonicElapsed = monotonicNowValue - this.lastMonotonicMs;
    const drift = wallElapsed - monotonicElapsed;

    if (Math.abs(drift) > JUMP_THRESHOLD_MS) {
      this.lastJump = {
        observedDriftMs: Math.round(drift),
        detectedAt: new Date(wallClockNow).toISOString(),
      };
    }

    this.lastWallClockMs = wallClockNow;
    this.lastMonotonicMs = monotonicNowValue;
  }

  /** Returns the current clock status. This module never claims 'ok'
   * means "verified correct" — only "no jump has been observed during
   * this app's runtime" — which is stated in the returned status's
   * shape, not asserted here in prose a caller could quote out of
   * context. */
  status(): ClockStatus {
    if (this.lastJump) {
      return { state: 'jumped', ...this.lastJump };
    }
    return { state: 'ok' };
  }

  /** Clears a previously observed jump, e.g. after the user has
   * acknowledged the warning. Does not affect future detection. */
  acknowledgeJump(): void {
    this.lastJump = null;
  }
}

/**
 * A process-wide monitor instance. TOTP generation and verification
 * should call sample() on this before reading status(), so a jump that
 * happened between calls is never missed because nothing polled for it.
 */
export const sharedClockMonitor = new ClockMonitor();
