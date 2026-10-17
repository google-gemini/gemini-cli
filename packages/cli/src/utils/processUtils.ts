/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChildProcess } from 'node:child_process';
import { runExitCleanup } from './cleanup.js';
import { waitForUpdateCompletion } from './handleAutoUpdate.js';

/**
 * Signals intercepted by the parent process when supervising a child process.
 * On POSIX platforms, all of these signals are forwarded to the child process
 * so signals sent directly to the parent PID (e.g., by process supervisors)
 * reach the child. On Windows (`win32`), `SIGINT` and `SIGQUIT` are intercepted
 * on the parent without calling `child.kill()` to avoid abrupt termination via
 * `TerminateProcess`.
 */
export const FORWARDED_SIGNALS: readonly NodeJS.Signals[] = [
  'SIGTERM',
  'SIGHUP',
  'SIGINT',
  'SIGQUIT',
  'SIGUSR1',
  'SIGUSR2',
];

/**
 * Registers signal listeners on the parent process to forward termination and
 * user signals to the spawned child process, returning a cleanup function to
 * remove the registered listeners.
 */
export function setupSignalForwarding(child: ChildProcess): () => void {
  const forwarders = new Map<NodeJS.Signals, () => void>();
  for (const sig of FORWARDED_SIGNALS) {
    const handler = () => {
      if (
        process.platform === 'win32' &&
        (sig === 'SIGINT' || sig === 'SIGQUIT')
      ) {
        // Do not forward terminal-generated signals on Windows to avoid abrupt parent termination.
        return;
      }
      try {
        child.kill(sig);
      } catch {
        // Child may already be gone
      }
    };
    forwarders.set(sig, handler);
    process.on(sig, handler);
  }
  return () => {
    for (const [sig, handler] of forwarders) {
      process.off(sig, handler);
    }
    forwarders.clear();
  };
}

/**
 * Handles the `close` event of a supervised child process by cleaning up signal
 * forwarders, resuming `process.stdin`, and either re-raising the child's
 * termination signal on the parent process (with a fallback timeout) or
 * resolving with the child's exit code.
 */
export function handleChildProcessClose(
  code: number | null,
  signal: NodeJS.Signals | null,
  removeForwarders: () => void,
  resolve: (exitCode: number) => void,
): void {
  removeForwarders();
  // Resume stdin before the parent process exits.
  process.stdin.resume();
  if (signal) {
    try {
      process.kill(process.pid, signal);
    } catch {
      resolve(1);
      return;
    }
    setTimeout(() => {
      resolve(1);
    }, 100);
    return;
  }
  resolve(code ?? 1);
}

/**
 * Exit code used to signal that the CLI should be relaunched.
 */
export const RELAUNCH_EXIT_CODE = 199;

/**
 * Exits the process with a special code to signal that the parent process should relaunch it.
 */
let isRelaunching = false;

/** @internal only for testing */
export function _resetRelaunchStateForTesting(): void {
  isRelaunching = false;
}

export async function relaunchApp(options?: {
  overrideAuthType?: string;
}): Promise<void> {
  if (isRelaunching) return;
  isRelaunching = true;
  await waitForUpdateCompletion();

  if (process.send && !process.env['VITEST'] && options?.overrideAuthType) {
    await new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };
      const timeout = setTimeout(done, 500);
      try {
        process.send!(
          {
            type: 'auth-selected-type',
            authType: options.overrideAuthType,
          },
          () => {
            clearTimeout(timeout);
            done();
          },
        );
      } catch {
        clearTimeout(timeout);
        done();
      }
    });
  }

  await runExitCleanup();

  process.exit(RELAUNCH_EXIT_CODE);
}

export interface ProcessWithSea extends NodeJS.Process {
  isSea?: () => boolean;
}

/**
 * Determines whether the current process is a "standard" SEA (Single Executable Application)
 * where the user arguments start at index 1 instead of index 2.
 * A relaunched SEA child will have process.argv[0] === process.argv[1] (because we inject execPath),
 * so it will return false here and correctly slice from index 2.
 */
export function isStandardSea(): boolean {
  return (
    process.argv[0] !== process.argv[1] &&
    (process.env['IS_BINARY'] === 'true' ||
      (process as ProcessWithSea).isSea?.() === true)
  );
}

/**
 * Extracts the user-provided script arguments from process.argv,
 * accounting for the differences in SEA execution modes.
 */
export function getScriptArgs(): string[] {
  return process.argv.slice(isStandardSea() ? 1 : 2);
}

/**
 * Determines if the current process is running in any SEA environment
 * (either the initial launch or a relaunched child).
 */
export function isSeaEnvironment(): boolean {
  return (
    process.env['IS_BINARY'] === 'true' ||
    (process as ProcessWithSea).isSea?.() === true ||
    process.argv[0] === process.argv[1]
  );
}

/**
 * Constructs the arguments and environment for spawning a child process during relaunch.
 * Handles differences between standard Node and SEA binary modes.
 */
export function getSpawnConfig(
  nodeArgs: string[],
  scriptArgs: string[],
): {
  spawnArgs: string[];
  env: NodeJS.ProcessEnv;
} {
  const isBinary = isSeaEnvironment();
  const newEnv: NodeJS.ProcessEnv = {
    ...process.env,
    GEMINI_CLI_NO_RELAUNCH: 'true',
  };

  const finalSpawnArgs: string[] = [];

  if (isBinary) {
    // In SEA mode, Node flags must be passed via NODE_OPTIONS, as the binary
    // passes all CLI arguments directly to the application.
    // We only need to append the *new* nodeArgs (e.g., memory flags).
    // Existing execArgv are inherited via the environment or baked into the binary.
    if (nodeArgs.length > 0) {
      for (const arg of nodeArgs) {
        if (/[\s"'\\]/.test(arg)) {
          throw new Error(
            `Unsupported node argument for SEA relaunch: ${arg}. Complex escaping is not supported.`,
          );
        }
      }
      const existingNodeOptions = process.env['NODE_OPTIONS'] || '';
      // nodeArgs in our codebase are simple flags like --max-old-space-size=X
      // that do not contain spaces and do not require complex escaping.
      newEnv['NODE_OPTIONS'] =
        `${existingNodeOptions} ${nodeArgs.join(' ')}`.trim();
    }
    // Binary is its own entry point. To maintain the [node, script, ...args]
    // structure expected by the application (which uses slice(2)),
    // we must provide a placeholder for the script path.
    // We explicitly use process.execPath to break the cycle and prevent
    // compounding argument duplication on subsequent relaunches.
    finalSpawnArgs.push(process.execPath, ...scriptArgs);
  } else {
    // Standard Node mode: pass all flags via command line.
    finalSpawnArgs.push(
      ...process.execArgv,
      ...nodeArgs,
      process.argv[1],
      ...scriptArgs,
    );
  }

  return {
    spawnArgs: finalSpawnArgs,
    env: newEnv,
  };
}
