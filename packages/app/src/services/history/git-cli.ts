/**
 * Thin wrapper around shelling out to the `git` CLI.
 *
 * We deliberately do NOT add a git library dependency (isomorphic-git,
 * nodegit, simple-git, ...). The history feature needs only a handful of
 * plumbing/porcelain commands, and shelling out to the real `git` binary
 * means we get its exact, battle-tested behavior (including on a Windows
 * checkout with all the CRLF/locking subtleties that entails) instead of
 * a reimplementation's edge cases.
 *
 * Every function here is a pure "run this git command in this directory"
 * primitive. None of them interpret failure as fatal to the caller: the
 * history feature's cardinal rule is that a failed history write must
 * never fail the operation the user actually asked for, and that
 * decision belongs to the caller (history-store.ts), not to this module.
 */

import { execFile } from 'node:child_process';

export interface GitResult {
  stdout: string;
  stderr: string;
}

export class GitCommandError extends Error {
  constructor(
    message: string,
    public readonly code: number | null,
    public readonly stdout: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = 'GitCommandError';
  }
}

/** Thrown specifically when the `git` executable itself could not be
 * found or started (ENOENT-shaped), as distinct from git running and
 * reporting a command failure. Callers use this to distinguish "git is
 * not installed" from "this particular git command failed". */
export class GitUnavailableError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GitUnavailableError';
  }
}

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/**
 * Runs a git command with `cwd` as the working directory (and therefore
 * the repository it operates on, for a working-tree repo). Resolves with
 * trimmed-free stdout/stderr on a zero exit code.
 *
 * Throws GitUnavailableError when the `git` executable cannot be found or
 * started at all, and GitCommandError when git ran but exited non-zero
 * (e.g. "nothing to commit", "bad revision", a merge conflict that cannot
 * occur in our append-only usage, etc). Callers decide which of those are
 * expected/benign for the operation they're performing.
 */
export function runGit(
  cwd: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; input?: string } = {},
): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'git',
      args,
      {
        cwd,
        // History payloads are small JSON/text snapshots, but a very
        // large town save or a big `git log` could exceed the default
        // 1MB buffer; give plenty of headroom rather than truncating.
        maxBuffer: 64 * 1024 * 1024,
        encoding: 'utf8',
        env: {
          ...process.env,
          ...options.env,
          // Never prompt interactively (e.g. for a credential we never
          // configure, since this repo has no remote). A hang here would
          // hang the caller's save/restore flow.
          GIT_TERMINAL_PROMPT: '0',
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          const code = errorCode(err);
          if (code === 'ENOENT') {
            reject(
              new GitUnavailableError(
                'The git executable was not found on PATH.',
                err,
              ),
            );
            return;
          }
          const execErr = err as NodeJS.ErrnoException & { code?: number | string };
          const exitCode =
            typeof execErr.code === 'number' ? execErr.code : null;
          reject(
            new GitCommandError(
              `git ${args.join(' ')} failed: ${stderr.trim() || err.message}`,
              exitCode,
              stdout,
              stderr,
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      },
    );

    if (options.input !== undefined) {
      child.stdin?.write(options.input);
      child.stdin?.end();
    } else {
      child.stdin?.end();
    }
  });
}

/**
 * Checks whether a usable `git` is on PATH by running `git --version`.
 * Never throws: any failure (not found, refused to run, unexpected
 * output) is reported as `available: false` with a human-readable reason,
 * so callers can expose an explicit "history unavailable" state instead
 * of crashing.
 */
export async function detectGit(
  cwd: string,
): Promise<{ available: true; version: string } | { available: false; reason: string }> {
  try {
    const { stdout } = await runGit(cwd, ['--version']);
    const version = stdout.trim();
    if (!version) {
      return {
        available: false,
        reason: 'git --version produced no output.',
      };
    }
    return { available: true, version };
  } catch (err) {
    if (err instanceof GitUnavailableError) {
      return {
        available: false,
        reason:
          'git is not installed, or its executable is not on PATH. Local version history is disabled until git is available.',
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      reason: `git --version failed: ${message}`,
    };
  }
}
