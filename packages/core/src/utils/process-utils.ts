/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';

import { spawnAsync } from './shell-utils.js';

/** Default timeout for SIGKILL escalation on Unix systems. */
export const SIGKILL_TIMEOUT_MS = 200;

/** Configuration for process termination. */
export interface KillOptions {
  /** The process ID to terminate. */
  pid: number;
  /** Whether to attempt SIGTERM before SIGKILL on Unix systems. */
  escalate?: boolean;
  /** Initial signal to use (defaults to SIGTERM if escalate is true, else SIGKILL). */
  signal?: NodeJS.Signals | number;
  /** Callback to check if the process has already exited. */
  isExited?: () => boolean;
  /** Optional PTY object for PTY-specific kill methods. */
  pty?: { kill: (signal?: string) => void };
}

/**
 * Robustly terminates a process or process group across platforms.
 *
 * On Windows, it uses `taskkill /f /t` to ensure the entire tree is terminated,
 * or the PTY's built-in kill method.
 *
 * On Unix, it attempts to kill the process group (using -pid) with escalation
 * from SIGTERM to SIGKILL if requested.
 */
export async function killProcessGroup(options: KillOptions): Promise<void> {
  const { pid, escalate = false, isExited = () => false, pty } = options;
  const isWindows = os.platform() === 'win32';

  if (isWindows) {
    if (pty) {
      try {
        pty.kill();
      } catch {
        // Ignore errors for dead processes
      }
    }
    // Invoke taskkill to ensure the entire tree is terminated and any orphaned descendant processes are reaped.
    try {
      await spawnAsync('taskkill', ['/pid', pid.toString(), '/f', '/t']);
    } catch {
      // Ignore errors if the process tree is already dead
    }
    return;
  }

  // Unix logic
  try {
    const initialSignal = options.signal || (escalate ? 'SIGTERM' : 'SIGKILL');

    // Try killing the process group first (-pid)
    process.kill(-pid, initialSignal);

    if (escalate && !isExited()) {
      await new Promise((res) => setTimeout(res, SIGKILL_TIMEOUT_MS));
      if (!isExited()) {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          // Ignore
        }
      }
    }
  } catch {
    // Fallback to specific process kill if group kill fails or on error
    if (!isExited()) {
      if (pty) {
        if (escalate) {
          try {
            // Attempt the group kill BEFORE the pty session leader dies
            process.kill(-pid, 'SIGTERM');
            pty.kill('SIGTERM');
            await new Promise((res) => setTimeout(res, SIGKILL_TIMEOUT_MS));
            if (!isExited()) {
              try {
                process.kill(-pid, 'SIGKILL');
              } catch {
                // Ignore
              }
              pty.kill('SIGKILL');
            }
          } catch {
            // Ignore
          }
        } else {
          try {
            process.kill(-pid, 'SIGKILL'); // Group kill first
            pty.kill('SIGKILL');
          } catch {
            // Ignore
          }
        }
      } else {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Ignore
        }
      }
    }
  }
}
