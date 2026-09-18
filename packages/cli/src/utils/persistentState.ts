/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Storage, debugLogger } from '@google/gemini-cli-core';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const STATE_FILENAME = 'state.json';
const BACKUP_SUFFIX = '.bak';
const CORRUPT_SUFFIX = '.corrupt';

interface PersistentStateData {
  defaultBannerShownCount?: Record<string, number>;
  terminalSetupPromptShown?: boolean;
  tipsShown?: number;
  hasSeenScreenReaderNudge?: boolean;
  focusUiEnabled?: boolean;
  startupWarningCounts?: Record<string, number>;
  // Add other persistent state keys here as needed
}

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
    try {
      const filePath = this.getPath();
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          this.cache = JSON.parse(content);
        } catch (error) {
          this.cache = this.recoverFromCorruptState(filePath, error);
        }
      } else {
        this.cache = {};
      }
    } catch (error) {
      debugLogger.warn('Failed to load persistent state:', error);
      this.cache = {};
    }
    return this.cache!;
  }

  private recoverFromCorruptState(
    filePath: string,
    parseError: unknown,
  ): PersistentStateData {
    const corruptPath = `${filePath}${CORRUPT_SUFFIX}`;
    let preservedPath: string | undefined;

    try {
      fs.renameSync(filePath, corruptPath);
      preservedPath = corruptPath;
    } catch {
      const uniqueCorruptPath = `${corruptPath}.${randomUUID()}`;
      try {
        fs.renameSync(filePath, uniqueCorruptPath);
        preservedPath = uniqueCorruptPath;
      } catch (preserveError) {
        debugLogger.warn(
          `Failed to preserve corrupt persistent state at ${filePath}:`,
          preserveError,
        );
      }
    }

    const backupPath = `${filePath}${BACKUP_SUFFIX}`;
    try {
      if (!fs.existsSync(backupPath)) {
        throw new Error(`No persistent state backup found at ${backupPath}`);
      }

      const backupContent = fs.readFileSync(backupPath, 'utf-8');
      const backupState: unknown = JSON.parse(backupContent);
      if (
        typeof backupState !== 'object' ||
        backupState === null ||
        Array.isArray(backupState)
      ) {
        throw new Error(`Invalid persistent state backup at ${backupPath}`);
      }
      debugLogger.warn(
        `Persistent state was corrupt; preserved it at ${preservedPath ?? filePath} and restored ${backupPath}.`,
        parseError,
      );
      return backupState as PersistentStateData;
    } catch (backupError) {
      debugLogger.warn(
        `Failed to restore persistent state backup at ${backupPath}:`,
        backupError,
      );
      return {};
    }
  }

  private save() {
    if (!this.cache) return;
    let temporaryPath: string | undefined;
    let fileDescriptor: number | undefined;

    try {
      const filePath = this.getPath();
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      temporaryPath = `${filePath}.${randomUUID()}.tmp`;
      fs.writeFileSync(temporaryPath, JSON.stringify(this.cache, null, 2), {
        encoding: 'utf-8',
        flag: 'wx',
      });

      // A writable descriptor is required for fsyncSync on Windows.
      fileDescriptor = fs.openSync(temporaryPath, 'r+');
      fs.fsyncSync(fileDescriptor);
      fs.closeSync(fileDescriptor);
      fileDescriptor = undefined;

      if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, `${filePath}${BACKUP_SUFFIX}`);
      }

      fs.renameSync(temporaryPath, filePath);
      temporaryPath = undefined;
    } catch (error) {
      if (fileDescriptor !== undefined) {
        try {
          fs.closeSync(fileDescriptor);
        } catch {
          // Preserve the original save error.
        }
      }
      if (temporaryPath) {
        try {
          fs.unlinkSync(temporaryPath);
        } catch {
          // Preserve the original save error.
        }
      }
      debugLogger.warn('Failed to save persistent state:', error);
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
