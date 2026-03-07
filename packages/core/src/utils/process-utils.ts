/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import { spawn as cpSpawn } from 'node:child_process';

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
  /**
   * Optional PTY object for PTY-specific kill methods.
   * The optional `pid` field allows Windows to use `taskkill /pid /f /t`
   * to terminate the full Win32 Job Object tree, preventing orphaned descendants.
   */
  pty?: { kill: (signal?: string) => void; pid?: number };
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
      // Step 1: Signal the PTY session leader (graceful teardown).
      try {
        pty.kill();
      } catch {
        // Ignore errors for dead processes
      }
      // Step 2: If the PTY exposes its PID, also invoke taskkill to forcibly
      // reap all descendant processes in the Win32 Job Object tree.
      // This prevents nested background jobs from surviving as orphans.
      // Uses an absolute path to prevent Untrusted Search Path (CWE-426) exploitation.
      if (pty.pid != null) {
        const systemRoot = process.env['SystemRoot'];
        const taskkillPath = systemRoot
          ? `${systemRoot}\\System32\\taskkill.exe`
          : 'taskkill';
        const child = cpSpawn(taskkillPath, [
          '/pid',
          pty.pid.toString(),
          '/f',
          '/t',
        ]);
        // Handle spawn errors gracefully — do not crash the CLI if the binary
        // is missing or access is denied.
        child.on('error', () => {
          try {
            pty.kill();
          } catch {
            // Ignore — PTY may already be dead
          }
        });
      }
    } else {
      cpSpawn('taskkill', ['/pid', pid.toString(), '/f', '/t']);
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
  } catch (_e) {
    // Fallback to specific process kill if group kill fails or on error
    if (!isExited()) {
      if (pty) {
        if (escalate) {
          try {
            pty.kill('SIGTERM');
            await new Promise((res) => setTimeout(res, SIGKILL_TIMEOUT_MS));
            if (!isExited()) pty.kill('SIGKILL');
          } catch {
            // Ignore
          }
        } else {
          try {
            pty.kill('SIGKILL');
          } catch {
            // Ignore
          }
        }
        // After PTY session-leader kill, also attempt group SIGKILL to reap
        // any orphaned descendant processes the leader may have spawned.
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          // Ignore — process group may already be gone
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
