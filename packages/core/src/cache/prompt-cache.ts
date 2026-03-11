/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as lockfile from 'proper-lockfile';
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
    const projectHash = crypto
      .createHash('sha256')
      .update(projectPath)
      .digest('hex');
    this.cacheFilePath = path.join(
      os.homedir(),
      '.cache',
      'gemini-cli',
      projectHash,
      'prompt-cache.json',
    );
  }

  private getCacheKey(): string {
    const keyPath = path.join(os.homedir(), '.cache', 'gemini-cli', 'hmac-key');
    if (fs.existsSync(keyPath)) {
      return fs.readFileSync(keyPath, 'utf8');
    }
    const newKey = crypto.randomBytes(32).toString('hex');
    const keyDir = path.dirname(keyPath);
    if (!fs.existsSync(keyDir)) {
      fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(keyPath, newKey, { mode: 0o600, encoding: 'utf8' });
    return newKey;
  }

  private sign(dataStr: string): string {
    return crypto
      .createHmac('sha256', this.getCacheKey())
      .update(dataStr)
      .digest('hex');
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
      const parsed = JSON.parse(data) as unknown;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('signature' in parsed) ||
        !('cache' in parsed)
      ) {
        return {};
      }

      const parsedObj = parsed as Record<string, unknown>;
      if (
        typeof parsedObj['signature'] !== 'string' ||
        !parsedObj['cache'] ||
        typeof parsedObj['cache'] !== 'object'
      ) {
        return {};
      }

      const cacheStr = safeJsonStringify(parsedObj['cache']);
      const expectedSignature = this.sign(cacheStr);
      if (expectedSignature !== parsedObj['signature']) {
        // Cache tampered
        return {};
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return parsedObj['cache'] as Record<string, PromptCacheEntry>;
    } catch (_e) {
      // If parsing fails or read errors, return empty cache
      return {};
    }
  }

  private writeCache(cache: Record<string, PromptCacheEntry>) {
    try {
      const cacheDir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
      }
      const cacheStr = safeJsonStringify(cache);
      const signature = this.sign(cacheStr);
      const dataToSave = {
        signature,
        cache,
      };
      fs.writeFileSync(this.cacheFilePath, safeJsonStringify(dataToSave, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
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

    // Ensure file exists for lockfile
    const cacheDir = path.dirname(this.cacheFilePath);
    if (!fs.existsSync(cacheDir)) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
      } catch (_e) {
        // ignore
      }
    }
    if (!fs.existsSync(this.cacheFilePath)) {
      try {
        fs.writeFileSync(this.cacheFilePath, '', { mode: 0o600 });
      } catch (_e) {
        // ignore
      }
    }

    let release: (() => void) | undefined;
    try {
      try {
        release = lockfile.lockSync(this.cacheFilePath, {
          stale: 5000,
          retries: 5,
        });
      } catch (_e) {
        // Continue without lock if lock fails, better than throwing
      }

      const cache = this.readCache();

      cache[hash] = {
        hash,
        response,
        timestamp: Date.now(),
        model,
        projectPath: this.projectPath,
      };

      // simple eviction, keep max 100 entries to prevent infinite growth
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
    } finally {
      if (release) {
        try {
          release();
        } catch (_e) {
          // ignore
        }
      }
    }
  }
}
