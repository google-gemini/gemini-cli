/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Storage } from '../config/storage.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { UserTierId } from '../code_assist/types.js';

const STATE_FILENAME = 'state.json';

interface CachedUserData {
  projectId?: string;
  userTier: UserTierId;
  timestamp: number;
}

export interface PersistentStateData {
  defaultBannerShownCount?: Record<string, number>;
  userTierCache?: CachedUserData;
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
        this.cache = JSON.parse(content);
      } else {
        this.cache = {};
      }
    } catch (error) {
      debugLogger.warn('Failed to load persistent state:', error);
      // If error reading (e.g. corrupt JSON), start fresh
      this.cache = {};
    }
    return this.cache!;
  }

  private save() {
    if (!this.cache) return;
    try {
      const filePath = this.getPath();
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(this.cache, null, 2));
    } catch (error) {
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
