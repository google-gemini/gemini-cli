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
