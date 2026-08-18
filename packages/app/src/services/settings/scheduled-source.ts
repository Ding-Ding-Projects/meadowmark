/**
 * Resolves a ScheduledRuleSource to the settings values it would apply.
 *
 * This is the seam between "the rule's time window matches right now" and
 * "here are the values to apply" - kept separate so a future network
 * source can be added without touching the time-matching logic in
 * scheduled-engine.ts at all.
 *
 * ONLY the 'local' source type is implemented. 'https' and
 * 'homeAssistant' are declared in scheduled-types.ts as a documented
 * extension point and are intentionally left unresolved here: this
 * module makes no network request of any kind, per this subsystem's
 * task scope. Resolving one of those source types reports an explicit
 * 'unavailable' status with a human-readable reason rather than silently
 * doing nothing or fabricating a value - a scheduled rule that cannot
 * actually be evaluated must never be reported as having matched.
 */

import { sanitizePartialSettings } from './store.js';
import type { SettingsValues } from './schema.js';
import type { ScheduledRuleSource } from './scheduled-types.js';

export type ResolvedScheduledSource =
  | { status: 'resolved'; values: Partial<SettingsValues> }
  | { status: 'unavailable'; reason: string };

/** A resolver is injectable so tests (and, in a future build, a real
 * network-backed implementation) can supply their own without touching
 * the engine. The default export below is the local-only resolver this
 * build actually uses. */
export type ScheduledSourceResolver = (source: ScheduledRuleSource) => ResolvedScheduledSource;

/**
 * The local-only resolver used by this build. Validates the local
 * source's values the same way the store validates anything else read
 * from an untrusted place (a rule can, after all, be hand-edited on
 * disk); invalid or unknown fields are dropped rather than applied.
 */
export const resolveLocalOnlyScheduledSource: ScheduledSourceResolver = (source) => {
  switch (source.type) {
    case 'local': {
      const { values } = sanitizePartialSettings(source.values);
      return { status: 'resolved', values };
    }
    case 'https':
      return {
        status: 'unavailable',
        reason:
          'Validated HTTPS scheduled-settings sources are not implemented in this build; ' +
          'this rule has no network transport to resolve its value from.',
      };
    case 'homeAssistant':
      return {
        status: 'unavailable',
        reason:
          'Home Assistant scheduled-settings sources are not implemented in this build; ' +
          'this rule has no network transport to resolve its value from.',
      };
    default: {
      const exhaustive: never = source;
      return { status: 'unavailable', reason: `Unknown scheduled source type: ${JSON.stringify(exhaustive)}` };
    }
  }
};
