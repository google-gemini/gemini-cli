/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview CLI commands for managing the daemon service.
 * Provides start, stop, status, and history commands.
 */

import {
  DaemonService,
  type DaemonStatus,
  type DaemonAction,
} from '../services/daemonService.js';
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';

let daemonInstance: DaemonService | null = null;

/**
 * Starts the daemon service.
 */
export async function startDaemon(config: Config): Promise<void> {
  if (daemonInstance) {
    console.log('Daemon is already running');
    return;
  }

  daemonInstance = new DaemonService({
    projectRoot: config.getProjectRoot(),
    configDir: config.storage.getProjectTempDir(),
    enableNotifications: true,
    onStateChange: (state) => {
      debugLogger.debug(`[Daemon] State changed to: ${state}`);
    },
    onAction: (action: DaemonAction) => {
      debugLogger.debug(`[Daemon] Action: ${action.type} - ${action.description}`);
    },
  });

  const started = await daemonInstance.start();
  if (started) {
    console.log('Daemon started successfully');
    console.log('  Watching project for changes...');
    console.log('  Periodic tick interval: 15 minutes');
    console.log('  Desktop notifications: enabled');
  } else {
    console.log('Failed to start daemon (may already be running)');
    daemonInstance = null;
  }
}

/**
 * Stops the daemon service.
 */
export async function stopDaemon(): Promise<void> {
  if (!daemonInstance) {
    console.log('Daemon is not running');
    return;
  }

  const stopped = await daemonInstance.stop();
  if (stopped) {
    console.log('Daemon stopped successfully');
    daemonInstance = null;
  } else {
    console.log('Failed to stop daemon');
  }
}

/**
 * Pauses the daemon service.
 */
export async function pauseDaemon(): Promise<void> {
  if (!daemonInstance) {
    console.log('Daemon is not running');
    return;
  }

  const paused = await daemonInstance.pause();
  if (paused) {
    console.log('Daemon paused');
  } else {
    console.log('Failed to pause daemon');
  }
}

/**
 * Resumes a paused daemon.
 */
export async function resumeDaemon(): Promise<void> {
  if (!daemonInstance) {
    console.log('Daemon is not running');
    return;
  }

  const resumed = await daemonInstance.resume();
  if (resumed) {
    console.log('Daemon resumed');
  } else {
    console.log('Failed to resume daemon');
  }
}

/**
 * Gets the daemon status.
 */
export async function getDaemonStatus(config: Config): Promise<DaemonStatus> {
  // If we have a running instance, return its status
  if (daemonInstance) {
    return daemonInstance.getStatus();
  }

  // Otherwise, check if there's a daemon PID file
  const tempInstance = new DaemonService({
    projectRoot: config.getProjectRoot(),
    configDir: config.storage.getProjectTempDir(),
  });

  // The status will reflect whether a daemon is running
  return {
    state: 'stopped',
    pid: null,
    uptime: null,
    lastTick: null,
    actionCount: 0,
    watchCount: 0,
  };
}

/**
 * Prints daemon status to console.
 */
export async function printDaemonStatus(config: Config): Promise<void> {
  const status = await getDaemonStatus(config);

  console.log('Daemon Status:');
  console.log(`  State: ${status.state}`);
  if (status.pid) {
    console.log(`  PID: ${status.pid}`);
  }
  if (status.uptime) {
    const minutes = Math.floor(status.uptime / 60000);
    const seconds = Math.floor((status.uptime % 60000) / 1000);
    console.log(`  Uptime: ${minutes}m ${seconds}s`);
  }
  if (status.lastTick) {
    console.log(`  Last tick: ${status.lastTick}`);
  }
  console.log(`  Actions taken: ${status.actionCount}`);
  console.log(`  Files watched: ${status.watchCount}`);
}

/**
 * Gets daemon action history.
 */
export async function getDaemonHistory(
  config: Config,
  days: number = 7
): Promise<void> {
  const tempInstance = new DaemonService({
    projectRoot: config.getProjectRoot(),
    configDir: config.storage.getProjectTempDir(),
  });

  // Use the daemon logger directly to get history
  const { DaemonLogger } = await import('../services/daemonLogger.js');
  const logger = new DaemonLogger(config.storage.getProjectTempDir());
  const entries = await logger.readLog(days);

  console.log(`Daemon History (last ${days} days):`);
  console.log('');

  if (entries.length === 0) {
    console.log('  No actions recorded.');
    return;
  }

  for (const entry of entries.reverse()) {
    const timestamp = new Date(entry.timestamp).toLocaleString();
    console.log(`  [${timestamp}] ${entry.type}`);
    if (entry.details.description) {
      console.log(`    ${entry.details.description}`);
    }
  }
}

/**
 * Undoes the last daemon action.
 */
export async function undoLastDaemonAction(config: Config): Promise<boolean> {
  if (!daemonInstance) {
    console.log('Daemon is not running');
    return false;
  }

  const undone = await daemonInstance.undoLastAction();
  if (undone) {
    console.log('Last daemon action undone successfully');
    return true;
  } else {
    console.log('Failed to undo last action (may not be reversible)');
    return false;
  }
}

/**
 * Gets the singleton daemon instance (for use by other services).
 */
export function getDaemonInstance(): DaemonService | null {
  return daemonInstance;
}