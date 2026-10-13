/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Storage, debugLogger } from '@google/gemini-cli-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const STATE_FILENAME = 'state.json';

interface PersistentStateData {
  defaultBannerShownCount?: Record<string, number>;
  terminalSetupPromptShown?: boolean;
  tipsShown?: number;
  hasSeenScreenReaderNudge?: boolean;
  focusUiEnabled?: boolean;
  startupWarningCounts?: Record<string, number>;
  // Add other persistent state keys here as needed
}

function isPersistentStateData(obj: unknown): obj is PersistentStateData {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

let tempCounter = 0;

export class PersistentState {
  private cache: PersistentStateData | null = null;
  private filePath: string | null = null;

  private getPath(): string {
    if (!this.filePath) {
      this.filePath = path.join(Storage.getGlobalGeminiDir(), STATE_FILENAME);
    }
    return this.filePath;
  }

  private load(): PersistentStateData {
    if (this.cache) {
      return this.cache;
    }
    const filePath = this.getPath();
    const backupPath = `${filePath}.bak`;
    const corruptPath = `${filePath}.corrupt`;

    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed: unknown = JSON.parse(content);
        if (isPersistentStateData(parsed)) {
          this.cache = parsed;
          return this.cache;
        }
        throw new Error('Persistent state is not a valid JSON object');
      } catch (error) {
        debugLogger.warn('Failed to load persistent state:', error);
        try {
          if (fs.existsSync(filePath)) {
            if (fs.existsSync(corruptPath)) {
              fs.unlinkSync(corruptPath);
            }
            fs.renameSync(filePath, corruptPath);
          }
        } catch {
          try {
            fs.unlinkSync(filePath);
          } catch {
            // Ignore failure to remove corrupt file
          }
        }
      }
    }

    if (fs.existsSync(backupPath)) {
      try {
        const bakContent = fs.readFileSync(backupPath, 'utf-8');
        const bakParsed: unknown = JSON.parse(bakContent);
        if (isPersistentStateData(bakParsed)) {
          debugLogger.warn('Recovered persistent state from backup');
          this.cache = bakParsed;
          this.save(true);
          return this.cache;
        }
      } catch (bakError) {
        debugLogger.warn(
          'Failed to load persistent state from backup:',
          bakError,
        );
      }
    }

    this.cache = {};
    return this.cache;
  }

  private save(skipBackup = false) {
    if (!this.cache) return;
    const filePath = this.getPath();
    const dir = path.dirname(filePath);
    const tempPath = path.join(
      dir,
      `.${STATE_FILENAME}.${process.pid}.${Date.now()}.${tempCounter++}.tmp`,
    );

    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const content = JSON.stringify(this.cache, null, 2);
      const fd = fs.openSync(tempPath, 'w', 0o600);
      try {
        fs.writeFileSync(fd, content, 'utf-8');
        try {
          fs.fsyncSync(fd);
        } catch {
          // fsync can fail on unsupported or virtualized filesystems
        }
      } finally {
        fs.closeSync(fd);
      }

      const backupPath = `${filePath}.bak`;
      if (!skipBackup && fs.existsSync(filePath)) {
        try {
          fs.copyFileSync(filePath, backupPath);
        } catch (err) {
          debugLogger.warn('Failed to update persistent state backup:', err);
        }
      }

      fs.renameSync(tempPath, filePath);
    } catch (error) {
      debugLogger.warn('Failed to save persistent state:', error);
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
        // Ignore cleanup error
      }
    }
  }

  get<K extends keyof PersistentStateData>(
    key: K,
  ): PersistentStateData[K] | undefined {
    return this.load()[key];
  }

  set<K extends keyof PersistentStateData>(
    key: K,
    value: PersistentStateData[K],
  ): void {
    this.load(); // ensure loaded
    this.cache![key] = value;
    this.save();
  }
}

export const persistentState = new PersistentState();
