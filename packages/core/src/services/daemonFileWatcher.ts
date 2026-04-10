/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview File watcher for the daemon service. Watches project files
 * for changes and emits events for analysis.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { debugLogger } from '../utils/debugLogger.js';

/** Patterns to ignore during file watching. */
const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.gemini',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'coverage',
  '.nyc_output',
  '*.log',
  '*.tmp',
  '.DS_Store',
  'Thumbs.db',
];

export interface FileWatchEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  timestamp: string;
}

type EventListener = (event: FileWatchEvent) => void;

/**
 * File watcher that monitors project files for changes.
 * Uses Node.js fs.watch under the hood with debouncing and filtering.
 */
export class FileWatcher {
  private readonly rootPath: string;
  private readonly ignorePatterns: string[];
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private listeners: Set<EventListener> = new Set();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly debounceMs: number;
  private isRunning = false;

  constructor(rootPath: string, ignorePatterns?: string[], debounceMs = 100) {
    this.rootPath = path.resolve(rootPath);
    this.ignorePatterns = [...DEFAULT_IGNORE_PATTERNS, ...(ignorePatterns ?? [])];
    this.debounceMs = debounceMs;
  }

  /**
   * Starts watching the project directory.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    await this.watchDirectory(this.rootPath);
    debugLogger.log(`[FileWatcher] Started watching: ${this.rootPath}`);
  }

  /**
   * Stops watching all directories.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();

    debugLogger.log('[FileWatcher] Stopped');
  }

  /**
   * Registers a listener for file change events.
   */
  on(event: 'change', listener: EventListener): void {
    this.listeners.add(listener);
  }

  /**
   * Removes a listener.
   */
  off(listener: EventListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Gets the number of directories being watched.
   */
  getWatchCount(): number {
    return this.watchers.size;
  }

  // --- Private methods ---

  private shouldIgnore(filePath: string): boolean {
    const relative = path.relative(this.rootPath, filePath);
    const parts = relative.split(path.sep);

    // Check each pattern
    for (const pattern of this.ignorePatterns) {
      if (pattern.startsWith('*')) {
        // Glob pattern - check extension or name match
        const ext = pattern.slice(1); // Remove *
        if (filePath.endsWith(ext) || filePath.endsWith(pattern.slice(1))) {
          return true;
        }
      } else {
        // Exact match on any path segment
        if (parts.includes(pattern)) {
          return true;
        }
      }
    }

    return false;
  }

  private async watchDirectory(dirPath: string): Promise<void> {
    if (!this.isRunning) return;
    if (this.shouldIgnore(dirPath)) return;

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (this.shouldIgnore(fullPath)) continue;

        if (entry.isDirectory()) {
          await this.watchDirectory(fullPath);
        }
      }

      // Watch the directory itself for new files/directories
      const watcher = fs.watch(dirPath, (eventType, filename) => {
        if (!filename || !this.isRunning) return;

        const fullPath = path.join(dirPath, filename);
        if (this.shouldIgnore(fullPath)) return;

        this.handleEvent(eventType, fullPath);
      });

      this.watchers.set(dirPath, watcher);
    } catch (error) {
      debugLogger.warn(`[FileWatcher] Failed to watch ${dirPath}:`, error);
    }
  }

  private handleEvent(eventType: string, filePath: string): void {
    // Debounce events to avoid rapid-fire on the same file
    const existing = this.debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.emitEvent(eventType, filePath);
    }, this.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  private async emitEvent(eventType: string, filePath: string): Promise<void> {
    let type: FileWatchEvent['type'];

    try {
      const stats = await fs.promises.stat(filePath).catch(() => null);
      if (stats === null) {
        type = 'unlink';
      } else if (eventType === 'rename') {
        type = 'add';
      } else {
        type = 'change';
      }
    } catch {
      type = 'unlink';
    }

    const event: FileWatchEvent = {
      type,
      path: filePath,
      timestamp: new Date().toISOString(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        debugLogger.error('[FileWatcher] Listener error:', error);
      }
    }
  }
}