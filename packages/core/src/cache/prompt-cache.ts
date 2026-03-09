/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';

export interface PromptCacheEntry {
  hash: string;
  response: GenerateContentResponse | GenerateContentResponse[];
  timestamp: number;
  model: string;
  projectPath: string;
}

export class PromptCache {
  private readonly cacheFilePath: string;

  constructor(private readonly projectPath: string) {
    this.cacheFilePath = path.join(projectPath, '.cache', 'prompt-cache.json');
  }

  // Generate a SHA-256 hash
  private generateHash(
    request: GenerateContentParameters,
    model: string,
  ): string {
    const dataToHash = {
      model,
      projectPath: this.projectPath,
      contents: request.contents,
      systemInstruction: request.config?.systemInstruction,
      tools: request.config?.tools,
    };

    // safeJsonStringify handles circular refs if any, though request config should be serializable
    const jsonStr = safeJsonStringify(dataToHash);
    return crypto.createHash('sha256').update(jsonStr).digest('hex');
  }

  private readCache(): Record<string, PromptCacheEntry> {
    try {
      if (!fs.existsSync(this.cacheFilePath)) {
        return {};
      }
      const data = fs.readFileSync(this.cacheFilePath, 'utf8');
      if (!data.trim()) {
        return {};
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return JSON.parse(data) as Record<string, PromptCacheEntry>;
    } catch (_e) {
      // If parsing fails or read errors, return empty cache
      return {};
    }
  }

  private writeCache(cache: Record<string, PromptCacheEntry>) {
    try {
      const cacheDir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      fs.writeFileSync(this.cacheFilePath, safeJsonStringify(cache, 2), 'utf8');
    } catch (_e) {
      // Ignore write errors (e.g., permissions)
    }
  }

  /**
   * Retrieves a cached response if one exists.
   */
  get(
    request: GenerateContentParameters,
    model: string,
  ): GenerateContentResponse | GenerateContentResponse[] | null {
    const hash = this.generateHash(request, model);
    const cache = this.readCache();

    const entry = cache[hash];
    if (entry) {
      return entry.response;
    }
    return null;
  }

  /**
   * Stores a response in the cache.
   */
  set(
    request: GenerateContentParameters,
    model: string,
    response: GenerateContentResponse | GenerateContentResponse[],
  ) {
    const hash = this.generateHash(request, model);
    const cache = this.readCache();

    cache[hash] = {
      hash,
      response,
      timestamp: Date.now(),
      model,
      projectPath: this.projectPath,
    };

    // Optional: simple eviction, keep max 100 entries to prevent infinite growth
    const keys = Object.keys(cache);
    if (keys.length > 100) {
      // Sort by timestamp and remove oldest
      const sortedKeys = keys.sort(
        (a, b) => cache[a].timestamp - cache[b].timestamp,
      );
      // Remove oldest 20 entries
      for (let i = 0; i < 20; i++) {
        delete cache[sortedKeys[i]];
      }
    }

    this.writeCache(cache);
  }
}
