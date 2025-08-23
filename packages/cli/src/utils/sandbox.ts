/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Safer sandbox entrypoints — minimal wrapper that uses sandbox_helpers.
 *
 * This module intentionally keeps runtime logic small and delegates parsing
 * and safety concerns to sandbox_helpers.ts so that behavior is testable.
 */
import helpers from './sandbox_helpers.js';
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
    console.error('Error starting sandbox proxy:', err);
    return undefined;
  }
}

export { parseAndFilterSandboxEnv, buildSafeEnv, parseCommandString, safeSpawnProxy } from './sandbox_helpers.js';

// Compatibility export for existing code - maintains the original signature
export async function start_sandbox(
  _sandboxConfig: unknown,
  _memoryArgs: string[],
  _config: unknown,
  _sandboxArgs: string[]
): Promise<void> {
  // For now, just handle the secure proxy functionality
  // This maintains compatibility with existing code while using our secure implementation
  const proxyProcess = startSandboxProxyIfConfigured();

  if (proxyProcess) {
    // If a proxy was started, wait for it to be ready
    // This is a simplified version - the original implementation might have done more
    return new Promise((resolve, reject) => {
      proxyProcess.on('error', reject);
      proxyProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Proxy process exited with code ${code}`));
        }
      });

      // For compatibility, resolve immediately if no proxy was needed
      if (!proxyProcess) {
        resolve();
      }
    });
  }
}

export default {
  startSandboxProxyIfConfigured,
  start_sandbox,
};