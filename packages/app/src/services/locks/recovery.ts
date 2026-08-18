/**
 * Toy-lock recovery.
 *
 * This is a user-experience lock, not a security boundary. Recovery is
 * therefore self-service and total: delete the application-data folder
 * and every toy lock (along with everything else Meadowmark keeps
 * locally) is gone. No reset ticket, no account, no support channel --
 * forgetting a toy-lock password is a normal, expected outcome, not an
 * emergency. Support Tickets (a different service in this app) plays the
 * bit of "filing a ticket" for exactly this recovery route; this module
 * only needs to expose the real, exact path.
 */

import { dataDir } from '../../store';
import { DATA_DIR_NAME } from '../../identity';

/** Always true: never present a toy lock as securing or protecting
 * anything. Every unlock failure and every lock-management surface
 * should show this text (or the UI's own localized/funny-level rendering
 * of the same facts) somewhere the user will see it. */
export const TOY_LOCK_DISCLAIMER =
  'This is a toy lock for fun -- a self-imposed speed bump, not security, ' +
  'not encryption, and not protection from anyone else with access to ' +
  'this computer.';

export interface RecoveryInfo {
  /** The exact, real application-data folder. Deleting it clears every
   * toy lock at once, along with all other locally stored Meadowmark
   * data -- say that plainly, do not undersell what the recovery step
   * costs. */
  folderPath: string;
  disclaimer: string;
  /** Full recovery copy naming the exact folder, meant to be shown
   * verbatim (subject to the UI's own language-mode and funny-level
   * styling of its wording, never of the facts). */
  recoverySteps: string;
}

export function getRecoveryInfo(): RecoveryInfo {
  const folderPath = dataDir();
  return {
    folderPath,
    disclaimer: TOY_LOCK_DISCLAIMER,
    recoverySteps:
      `Forgot a toy lock's password, or lost its authenticator? There is ` +
      `no reset ticket and no support channel for this -- delete the ` +
      `"${DATA_DIR_NAME}" application data folder at ${folderPath} to ` +
      `clear every toy lock at once. This also clears every other ` +
      `locally stored Meadowmark save, setting, and history entry, so ` +
      `it is a last resort, not a quick fix.`,
  };
}
