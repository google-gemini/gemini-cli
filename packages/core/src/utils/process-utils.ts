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
 * from SIGTERM to SIGKILL if requested. It also walks the process tree using pgrep
 * to ensure all descendants are killed.
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

  // Unix logic: Walk process tree to find all descendants
  const getAllDescendants = async (parentPid: number): Promise<number[]> => {
    let children: number[] = [];
    try {
      const { stdout } = await spawnAsync('pgrep', [
        '-P',
        parentPid.toString(),
      ]);
      const pids = stdout
        .trim()
        .split('\n')
        .map((p: string) => parseInt(p, 10))
        .filter((p: number) => !isNaN(p));
      for (const p of pids) {
        children.push(p);
        const grandchildren = await getAllDescendants(p);
        children = children.concat(grandchildren);
      }
    } catch {
      // pgrep exits with 1 if no children are found
    }
    return children;
  };

  const descendants = await getAllDescendants(pid);
  const allPidsToKill = [...descendants.reverse(), pid];

  try {
    const initialSignal = options.signal || (escalate ? 'SIGTERM' : 'SIGKILL');

    // Try killing the process group first (-pid)
    try {
      process.kill(-pid, initialSignal);
    } catch {
      // Ignore
    }

    // Kill individual processes in the tree to ensure detached descendants are caught
    for (const targetPid of allPidsToKill) {
      try {
        process.kill(targetPid, initialSignal);
      } catch {
        // Ignore
      }
    }

    if (pty) {
      try {
        pty.kill(typeof initialSignal === 'string' ? initialSignal : undefined);
      } catch {
        // Ignore
      }
    }

    if (escalate && !isExited()) {
      await new Promise((res) => setTimeout(res, SIGKILL_TIMEOUT_MS));
      if (!isExited()) {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          // Ignore
        }

        for (const targetPid of allPidsToKill) {
          try {
            process.kill(targetPid, 'SIGKILL');
          } catch {
            // Ignore
          }
        }
        if (pty) {
          try {
            pty.kill('SIGKILL');
          } catch {
            // Ignore
          }
        }
      }
    }
  } catch {
    // Ultimate fallback if something unexpected throws
    if (!isExited()) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Ignore
      }
    }
  }
}
