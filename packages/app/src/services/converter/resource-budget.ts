/**
 * Live enforcement of a ResourceLimits envelope for one conversion.
 *
 * Every adapter is handed one of these through ConversionContext and is
 * required to call it at every point that could otherwise be unbounded:
 * each byte range read, each byte range written, each recursion into a
 * nested structure, each discrete item counted. This is what turns the
 * declared limits in a RegistryEntry from documentation into an actual
 * boundary a hostile or merely huge input cannot cross.
 */

import { CancelledError, ResourceLimitExceededError } from './errors';
import type { ResourceBudget, ResourceLimits } from './types';

export function createResourceBudget(limits: ResourceLimits, signal: AbortSignal): ResourceBudget {
  let inputBytes = 0;
  let outputBytes = 0;
  let depth = 0;
  let items = 0;
  const startedAt = Date.now();

  function checkAbort(): void {
    if (signal.aborted) {
      throw new CancelledError();
    }
  }

  function checkCpu(): void {
    if (Date.now() - startedAt > limits.maxCpuMs) {
      throw new ResourceLimitExceededError('cpu-time', limits.maxCpuMs);
    }
  }

  return {
    limits,

    check(): void {
      checkAbort();
      checkCpu();
    },

    consumeInput(n: number): void {
      checkAbort();
      inputBytes += n;
      if (inputBytes > limits.maxInputBytes) {
        throw new ResourceLimitExceededError('input-bytes', limits.maxInputBytes);
      }
      checkCpu();
    },

    produceOutput(n: number): void {
      checkAbort();
      outputBytes += n;
      if (outputBytes > limits.maxOutputBytes) {
        throw new ResourceLimitExceededError('output-bytes', limits.maxOutputBytes);
      }
      checkCpu();
    },

    enterDepth(): () => void {
      checkAbort();
      depth += 1;
      if (depth > limits.maxDepth) {
        throw new ResourceLimitExceededError('depth', limits.maxDepth);
      }
      let exited = false;
      return () => {
        if (!exited) {
          exited = true;
          depth -= 1;
        }
      };
    },

    countItem(): void {
      checkAbort();
      items += 1;
      if (items > limits.maxItems) {
        throw new ResourceLimitExceededError('items', limits.maxItems);
      }
      // Item counting happens in tight loops; also check CPU time here so
      // a huge-but-shallow structure (e.g. a flat million-key object)
      // cannot run past its time budget between depth checks.
      checkCpu();
    },
  };
}
