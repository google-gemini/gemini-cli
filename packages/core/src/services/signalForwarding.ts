/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChildProcess } from 'node:child_process';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Signals that should be forwarded from the bootstrap parent process to the
 * spawned child. These cover the standard termination / hang-up / user-defined
 * signals that a process manager (systemd, container runtime, ACP client, …)
 * may deliver to the parent.
 *
 * SIGINT is included for completeness even though interactive Ctrl-C already
 * reaches the child via the controlling terminal's process-group delivery , 
 * programmatic `kill(pid, SIGINT)` targets only the parent and would otherwise
 * leave the child running.
 *
 * SIGKILL and SIGSTOP are intentionally omitted because they cannot be caught.
 *
 * @see https://github.com/google-gemini/gemini-cli/issues/25590
 */
export const FORWARDED_SIGNALS: readonly NodeJS.Signals[] = [
  'SIGTERM',
  'SIGHUP',
  'SIGINT',
  'SIGQUIT',
  'SIGUSR1',
  'SIGUSR2',
] as const;

/**
 * The default grace period (in ms) to wait for the child to exit after
 * forwarding a signal before escalating to SIGKILL.
 */
export const DEFAULT_SIGNAL_GRACE_MS = 5_000;

/**
 * Manages signal forwarding from the current (parent) process to a spawned
 * child process. Installing forwarders ensures that when the parent receives a
 * termination signal (e.g. from a process manager), the child is also notified
 * rather than being orphaned.
 *
 * Forwarders are stored in a Map so that cleanup is precise ,  we never call
 * `removeAllListeners`, which would disturb other subscribers.
 *
 * Calling {@link install} multiple times without {@link remove} in between is a
 * no-op (the forwarders from the first call remain). This prevents listener
 * leaks when `relaunchOnExitCode` re-enters the runner closure.
 *
 * @example
 * ```ts
 * const forwarder = new SignalForwarder(child);
 * forwarder.install();
 * child.on('close', () => forwarder.remove());
 * ```
 *
 * @see https://github.com/google-gemini/gemini-cli/issues/25590
 */
export class SignalForwarder {
  private readonly handlers = new Map<NodeJS.Signals, () => void>();
  private installed = false;
  private escalationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly child: ChildProcess,
    private readonly signals: readonly NodeJS.Signals[] = FORWARDED_SIGNALS,
    private readonly graceMs: number = DEFAULT_SIGNAL_GRACE_MS,
  ) {}

  /**
   * Installs signal handlers on the current process that forward each signal
   * to the child. Safe to call multiple times; only the first call installs.
   */
  install(): void {
    if (this.installed) {
      return;
    }

    for (const sig of this.signals) {
      const handler = () => {
        this.forwardSignal(sig);
      };
      this.handlers.set(sig, handler);
      process.on(sig, handler);
    }

    this.installed = true;
    debugLogger.debug(
      `[SignalForwarder] Installed ${this.handlers.size} signal forwarders for child PID ${this.child.pid}`,
    );
  }

  /**
   * Removes all installed signal handlers. Safe to call multiple times;
   * subsequent calls after the first are no-ops.
   *
   * Also clears any pending escalation timer.
   */
  remove(): void {
    if (!this.installed) {
      return;
    }

    for (const [sig, handler] of this.handlers) {
      process.off(sig, handler);
    }
    this.handlers.clear();
    this.installed = false;

    if (this.escalationTimer !== null) {
      clearTimeout(this.escalationTimer);
      this.escalationTimer = null;
    }

    debugLogger.debug(
      `[SignalForwarder] Removed signal forwarders for child PID ${this.child.pid}`,
    );
  }

  /**
   * Returns `true` if forwarders are currently installed.
   */
  isInstalled(): boolean {
    return this.installed;
  }

  /**
   * Returns the number of signals currently being forwarded.
   */
  get size(): number {
    return this.handlers.size;
  }

  /**
   * Forwards a single signal to the child process.
   *
   * The `try/catch` guards the race where the signal arrives just after the
   * child has exited ,  `child.kill()` would throw `ESRCH` in that case.
   *
   * For fatal signals (SIGTERM, SIGHUP, SIGQUIT) an escalation timer is
   * started: if the child does not exit within {@link graceMs}, SIGKILL is
   * sent to guarantee cleanup.
   */
  private forwardSignal(sig: NodeJS.Signals): void {
    try {
      const sent = this.child.kill(sig);
      if (sent) {
        debugLogger.debug(
          `[SignalForwarder] Forwarded ${sig} to child PID ${this.child.pid}`,
        );
      } else {
        debugLogger.warn(
          `[SignalForwarder] Failed to forward ${sig} ,  child PID ${this.child.pid} may have already exited`,
        );
      }
    } catch {
      // Child is already gone ,  nothing to do.
      debugLogger.debug(
        `[SignalForwarder] Child PID ${this.child.pid} already exited; ignoring ${sig}`,
      );
      return;
    }

    // Escalate to SIGKILL if the child does not exit in time.
    if (this.isFatalSignal(sig) && this.escalationTimer === null) {
      this.escalationTimer = setTimeout(() => {
        this.escalateToKill();
      }, this.graceMs);

      // Don't let the timer keep the parent alive if the child exits normally.
      if (this.escalationTimer && typeof this.escalationTimer.unref === 'function') {
        this.escalationTimer.unref();
      }
    }
  }

  /**
   * Sends SIGKILL to the child as a last resort.
   */
  private escalateToKill(): void {
    this.escalationTimer = null;
    try {
      this.child.kill('SIGKILL');
      debugLogger.warn(
        `[SignalForwarder] Escalated to SIGKILL for child PID ${this.child.pid} after ${this.graceMs}ms grace period`,
      );
    } catch {
      // Child already exited ,  nothing to do.
    }
  }

  /**
   * Returns `true` for signals that should trigger escalation to SIGKILL
   * if the child does not exit within the grace period.
   */
  private isFatalSignal(sig: NodeJS.Signals): boolean {
    return sig === 'SIGTERM' || sig === 'SIGHUP' || sig === 'SIGQUIT';
  }
}

/**
 * Convenience function for the lightweight parent in `index.ts` that does not
 * import the full `SignalForwarder` class. Installs plain forwarding handlers
 * and returns a cleanup function.
 *
 * @returns A function that removes all installed handlers.
 */
export function installSignalForwarders(
  child: ChildProcess,
  signals: readonly NodeJS.Signals[] = FORWARDED_SIGNALS,
): () => void {
  const forwarder = new SignalForwarder(child, signals);
  forwarder.install();
  return () => forwarder.remove();
}
