/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { Storage } from '../config/storage.js';
import { debugLogger } from '../utils/debugLogger.js';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';

/**
 * Metadata for a single Gemini Context Cache resource.
 */
export interface ContextCacheEntry {
  /** The full resource name, e.g., 'cachedContents/xyz123' */
  cacheName: string;
  /** The model ID this cache was created for */
  model: string;
  /** ISO 8601 expiration timestamp */
  expiresAt: string;
  /** Number of tokens in the cached content */
  tokenCount: number;
}

/**
 * Schema for the local persistent metadata storage.
 */
export interface ContextCacheMetadata {
  version: string;
  /** Map of SHA-256(SI) -> ContextCacheEntry */
  entries: Record<string, ContextCacheEntry>;
}

/**
 * Manages the lifecycle and discovery of Gemini Context Caches.
 * Uses a local metadata file to map System Instruction hashes to remote cache IDs.
 */
export class ContextCacheManager {
  private metadata: ContextCacheMetadata | undefined;
  private _metadataPath: string | undefined;

  constructor() {}

  private get metadataPath(): string {
    if (!this._metadataPath) {
      this._metadataPath = Storage.getContextCacheMetadataPath();
    }
    return this._metadataPath;
  }

  /**
   * Resets the in-memory metadata and path. Used for testing.
   */
  reset(): void {
    this.metadata = undefined;
    this._metadataPath = undefined;
  }

  private loadMetadata(): ContextCacheMetadata {
    if (this.metadata) {
      return this.metadata;
    }

    try {
      if (fs.existsSync(this.metadataPath)) {
        const content = fs.readFileSync(this.metadataPath, 'utf8');
        const parsed = JSON.parse(content) as unknown;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        this.metadata = parsed as ContextCacheMetadata;
      } else {
        this.metadata = { version: '1.0', entries: {} };
      }
    } catch (error) {
      debugLogger.error('Failed to load context cache metadata:', error);
      this.metadata = { version: '1.0', entries: {} };
    }

    return this.metadata;
  }

  private saveMetadata(): void {
    if (!this.metadata) return;

    try {
      fs.writeFileSync(
        this.metadataPath,
        JSON.stringify(this.metadata, null, 2),
      );
    } catch (error) {
      debugLogger.error('Failed to save context cache metadata:', error);
    }
  }

  /**
   * Calculates a stable SHA-256 hash of the System Instruction.
   */
  calculateHash(systemInstruction: string): string {
    return crypto.createHash('sha256').update(systemInstruction).digest('hex');
  }

  /**
   * Calculates the token count of a system instruction string.
   */
  calculateTokenCount(systemInstruction: string): number {
    return estimateTokenCountSync([{ text: systemInstruction }]);
  }

  /**
   * Looks up a hot cache for the given SI hash.
   * Purges the entry if it has expired.
   */
  getCache(hash: string): ContextCacheEntry | undefined {
    const metadata = this.loadMetadata();
    const entry = metadata.entries[hash];

    if (entry) {
      const now = new Date();
      if (new Date(entry.expiresAt) > now) {
        return entry;
      } else {
        // Purge expired entry
        debugLogger.log(
          `[ContextCache] Purging expired cache: ${entry.cacheName}`,
        );
        delete metadata.entries[hash];
        this.saveMetadata();
      }
    }

    return undefined;
  }

  /**
   * Saves or updates a cache entry.
   */
  setCache(hash: string, entry: ContextCacheEntry): void {
    const metadata = this.loadMetadata();
    metadata.entries[hash] = entry;
    this.saveMetadata();
  }

  /**
   * Removes a cache entry by hash.
   */
  removeCache(hash: string): void {
    const metadata = this.loadMetadata();
    if (metadata.entries[hash]) {
      delete metadata.entries[hash];
      this.saveMetadata();
    }
  }
}

/** Global singleton instance */
export const contextCacheManager = new ContextCacheManager();
