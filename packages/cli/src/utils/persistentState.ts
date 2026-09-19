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
  private saveQueue: Promise<void> = Promise.resolve();

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

  private save(): Promise<void> {
    if (!this.cache) return this.saveQueue;

    const serializedState = JSON.stringify(this.cache, null, 2);
    this.saveQueue = this.saveQueue
      .catch(() => {})
      .then(async () => {
        const filePath = this.getPath();
        const dir = path.dirname(filePath);
        let temporaryPath: string | undefined;
        let fileHandle: fs.promises.FileHandle | undefined;

        try {
          await fs.promises.mkdir(dir, { recursive: true });

          temporaryPath = `${filePath}.${randomUUID()}.tmp`;
          fileHandle = await fs.promises.open(temporaryPath, 'wx');
          await fileHandle.writeFile(serializedState, 'utf-8');
          await fileHandle.sync();
          await fileHandle.close();
          fileHandle = undefined;

          try {
            await fs.promises.copyFile(filePath, `${filePath}${BACKUP_SUFFIX}`);
          } catch (error) {
            if (
              typeof error !== 'object' ||
              error === null ||
              !('code' in error) ||
              error.code !== 'ENOENT'
            ) {
              throw error;
            }
          }

          await fs.promises.rename(temporaryPath, filePath);
          temporaryPath = undefined;
        } catch (error) {
          if (fileHandle) {
            await fileHandle.close().catch(() => {});
          }
          if (temporaryPath) {
            await fs.promises.unlink(temporaryPath).catch(() => {});
          }
          debugLogger.warn('Failed to save persistent state:', error);
        }
      });

    return this.saveQueue;
  }

  get<K extends keyof PersistentStateData>(
    key: K,
  ): PersistentStateData[K] | undefined {
    return this.load()[key];
  }

  set<K extends keyof PersistentStateData>(
    key: K,
    value: PersistentStateData[K],
  ): Promise<void> {
    this.load(); // ensure loaded
    this.cache![key] = value;
    return this.save();
  }
}

export const persistentState = new PersistentState();
