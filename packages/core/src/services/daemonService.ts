/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Core daemon service that manages a persistent background process
 * for proactive actions. Watches project files, sends periodic ticks, and
 * performs autonomous tasks like detecting TODOs, failing tests, and outdated
 * dependencies.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLogger } from '../utils/debugLogger.js';
import { FileWatcher, type FileWatchEvent } from './daemonFileWatcher.js';
import { ProactiveActionEngine } from './daemonProactive.js';
import { DaemonNotifier } from './daemonNotifier.js';
import { DaemonLogger, type DaemonLogEntry } from './daemonLogger.js';

/** Default interval between proactive ticks (15 minutes in ms). */
const DEFAULT_TICK_INTERVAL_MS = 15 * 60 * 1000;

/** PID file name for daemon process management. */
const DAEMON_PID_FILE = '.gemini-daemon.pid';

/** Daemon state file for tracking actions. */
const DAEMON_STATE_FILE = '.gemini-daemon-state.json';

export type DaemonState = 'stopped' | 'running' | 'paused';

export interface DaemonConfig {
  /** Root directory to watch. */
  projectRoot: string;
  /** Interval between proactive ticks in ms. */
  tickIntervalMs?: number;
  /** Whether to enable desktop notifications. */
  enableNotifications?: boolean;
  /** Config directory for storing daemon state. */
  configDir?: string;
  /** Callback when daemon state changes. */
  onStateChange?: (state: DaemonState) => void;
  /** Callback when proactive action is taken. */
  onAction?: (action: DaemonAction) => void;
}

export interface DaemonAction {
  id: string;
  type: ProactiveActionType;
  timestamp: string;
  description: string;
  details: Record<string, unknown>;
  reversible: boolean;
  undoData?: Record<string, unknown>;
}

export type ProactiveActionType =
  | 'todo_detected'
  | 'test_failure'
  | 'dependency_outdated'
  | 'file_changed'
  | 'periodic_tick'
  | 'user_notification';

export interface DaemonStatus {
  state: DaemonState;
  pid: number | null;
  uptime: number | null;
  lastTick: string | null;
  actionCount: number;
  watchCount: number;
}

/**
 * Core daemon service that orchestrates background proactive actions.
 */
export class DaemonService {
  private state: DaemonState = 'stopped';
  private pid: number | null = null;
  private startTime: number | null = null;
  private lastTick: string | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private fileWatcher: FileWatcher | null = null;
  private proactiveEngine: ProactiveActionEngine | null = null;
  private notifier: DaemonNotifier | null = null;
  private logger: DaemonLogger | null = null;
  private actions: DaemonAction[] = [];
  private readonly config: Required<DaemonConfig>;

  constructor(config: DaemonConfig) {
    this.config = {
      projectRoot: config.projectRoot,
      tickIntervalMs: config.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS,
      enableNotifications: config.enableNotifications ?? true,
      configDir: config.configDir ?? path.join(os.homedir(), '.gemini'),
      onStateChange: config.onStateChange ?? (() => {}),
      onAction: config.onAction ?? (() => {}),
    };
  }

  /**
   * Starts the daemon. Returns true if started successfully.
   */
  async start(): Promise<boolean> {
    if (this.state !== 'stopped') {
      debugLogger.warn('[Daemon] Already running or paused');
      return false;
    }

    try {
      // Check for existing daemon
      const existingPid = await this.readPidFile();
      if (existingPid !== null && await this.isProcessAlive(existingPid)) {
        debugLogger.warn(`[Daemon] Another daemon is already running (PID: ${existingPid})`);
        return false;
      }

      // Initialize components
      this.logger = new DaemonLogger(this.config.configDir);
      this.fileWatcher = new FileWatcher(this.config.projectRoot);
      this.proactiveEngine = new ProactiveActionEngine(this.config.projectRoot);
      this.notifier = new DaemonNotifier();

      // Set up file watcher
      this.fileWatcher.on('change', (event) => this.handleFileChange(event));

      // Start file watching
      await this.fileWatcher.start();

      // Write PID file
      this.pid = process.pid;
      this.startTime = Date.now();
      await this.writePidFile();

      // Start periodic tick
      this.startTickTimer();

      // Update state
      this.state = 'running';
      this.config.onStateChange(this.state);

      await this.logger.log({
        type: 'daemon_start',
        timestamp: new Date().toISOString(),
        details: { pid: this.pid, projectRoot: this.config.projectRoot },
      });

      debugLogger.log(`[Daemon] Started (PID: ${this.pid})`);
      return true;
    } catch (error) {
      debugLogger.error('[Daemon] Failed to start:', error);
      await this.cleanup();
      return false;
    }
  }

  /**
   * Stops the daemon. Returns true if stopped successfully.
   */
  async stop(): Promise<boolean> {
    if (this.state === 'stopped') {
      return true;
    }

    try {
      await this.cleanup();

      this.state = 'stopped';
      this.config.onStateChange(this.state);

      await this.logger?.log({
        type: 'daemon_stop',
        timestamp: new Date().toISOString(),
        details: { pid: this.pid },
      });

      debugLogger.log('[Daemon] Stopped');
      return true;
    } catch (error) {
      debugLogger.error('[Daemon] Failed to stop:', error);
      return false;
    }
  }

  /**
   * Pauses the daemon (stops tick timer but keeps file watcher).
   */
  async pause(): Promise<boolean> {
    if (this.state !== 'running') {
      return false;
    }

    this.stopTickTimer();
    this.state = 'paused';
    this.config.onStateChange(this.state);

    await this.logger?.log({
      type: 'daemon_pause',
      timestamp: new Date().toISOString(),
      details: {},
    });

    debugLogger.log('[Daemon] Paused');
    return true;
  }

  /**
   * Resumes a paused daemon.
   */
  async resume(): Promise<boolean> {
    if (this.state !== 'paused') {
      return false;
    }

    this.startTickTimer();
    this.state = 'running';
    this.config.onStateChange(this.state);

    await this.logger?.log({
      type: 'daemon_resume',
      timestamp: new Date().toISOString(),
      details: {},
    });

    debugLogger.log('[Daemon] Resumed');
    return true;
  }

  /**
   * Gets the current daemon status.
   */
  getStatus(): DaemonStatus {
    return {
      state: this.state,
      pid: this.pid,
      uptime: this.startTime ? Date.now() - this.startTime : null,
      lastTick: this.lastTick,
      actionCount: this.actions.length,
      watchCount: this.fileWatcher?.getWatchCount() ?? 0,
    };
  }

  /**
   * Undoes the last action if reversible.
   */
  async undoLastAction(): Promise<boolean> {
    const lastAction = this.actions[this.actions.length - 1];
    if (!lastAction || !lastAction.reversible) {
      return false;
    }

    try {
      const result = await this.proactiveEngine?.undoAction(lastAction);
      if (result) {
        this.actions.pop();
        await this.logger?.log({
          type: 'daemon_undo',
          timestamp: new Date().toISOString(),
          details: { actionId: lastAction.id },
        });
        return true;
      }
      return false;
    } catch (error) {
      debugLogger.error('[Daemon] Failed to undo action:', error);
      return false;
    }
  }

  /**
   * Gets all logged actions.
   */
  async getActionHistory(): Promise<DaemonLogEntry[]> {
    if (!this.logger) return [];
    return this.logger.readLog();
  }

  // --- Private methods ---

  private startTickTimer(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
    }
    this.tickTimer = setInterval(() => {
      void this.performTick();
    }, this.config.tickIntervalMs);
    // Don't keep the process alive for just the timer
    this.tickTimer.unref();
  }

  private stopTickTimer(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private async performTick(): Promise<void> {
    if (this.state !== 'running') return;

    this.lastTick = new Date().toISOString();
    debugLogger.debug('[Daemon] Performing periodic tick');

    try {
      const actions = await this.proactiveEngine?.performTick() ?? [];

      for (const action of actions) {
        await this.handleAction(action);
      }
    } catch (error) {
      debugLogger.error('[Daemon] Tick failed:', error);
    }
  }

  private async handleFileChange(event: FileWatchEvent): Promise<void> {
    if (this.state !== 'running') return;

    debugLogger.debug(`[Daemon] File changed: ${event.path}`);

    try {
      const actions = await this.proactiveEngine?.analyzeFileChange(event) ?? [];

      for (const action of actions) {
        await this.handleAction(action);
      }
    } catch (error) {
      debugLogger.error('[Daemon] File change analysis failed:', error);
    }
  }

  private async handleAction(action: DaemonAction): Promise<void> {
    this.actions.push(action);

    await this.logger?.log({
      type: 'daemon_action',
      timestamp: action.timestamp,
      details: {
        actionId: action.id,
        actionType: action.type,
        description: action.description,
      },
    });

    this.config.onAction(action);

    if (this.config.enableNotifications && this.notifier) {
      await this.notifier.notify({
        title: `Gemini CLI: ${action.type.replace(/_/g, ' ')}`,
        body: action.description,
      });
    }
  }

  private async cleanup(): Promise<void> {
    this.stopTickTimer();

    if (this.fileWatcher) {
      await this.fileWatcher.stop();
      this.fileWatcher = null;
    }

    this.proactiveEngine = null;
    this.notifier = null;

    await this.removePidFile();

    this.pid = null;
    this.startTime = null;
  }

  private async writePidFile(): Promise<void> {
    const pidPath = path.join(this.config.configDir, DAEMON_PID_FILE);
    await fs.mkdir(this.config.configDir, { recursive: true });
    await fs.writeFile(pidPath, String(this.pid), 'utf-8');
  }

  private async removePidFile(): Promise<void> {
    const pidPath = path.join(this.config.configDir, DAEMON_PID_FILE);
    try {
      await fs.unlink(pidPath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  private async readPidFile(): Promise<number | null> {
    const pidPath = path.join(this.config.configDir, DAEMON_PID_FILE);
    try {
      const content = await fs.readFile(pidPath, 'utf-8');
      return parseInt(content.trim(), 10);
    } catch {
      return null;
    }
  }

  private async isProcessAlive(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}