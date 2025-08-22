/**
 * Safer sandbox entrypoints — minimal wrapper that uses sandbox_helpers.
 *
 * This module intentionally keeps runtime logic small and delegates parsing
 * and safety concerns to sandbox_helpers.ts so that behavior is testable.
 */
import helpers from './sandbox_helpers';
import type { ChildProcess } from 'node:child_process';

/** Public API used by the rest of the CLI for sandbox setup.
 *  Historically the repo used various environment variables and spawned
 *  shell commands directly. This wrapper centralizes the safe behaviour.
 *
 *  Returns the spawned ChildProcess when a proxy was started, otherwise undefined.
 */
export function startSandboxProxyIfConfigured(): ChildProcess | undefined {
  try {
    const cp = helpers.safeSpawnProxy();
    return cp;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error starting sandbox proxy:', err);
    return undefined;
  }
}

export { parseAndFilterSandboxEnv, buildSafeEnv, parseCommandString, safeSpawnProxy } from './sandbox_helpers';

export default {
  startSandboxProxyIfConfigured,
};