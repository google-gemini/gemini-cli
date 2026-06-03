/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  CountTokensResponse,
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import type { UserTierId, GeminiUserTier } from '../code_assist/types.js';
import type { LlmRole } from '../telemetry/types.js';
import { debugLogger } from '../utils/debugLogger.js';

interface CacheEntry {
  key: string;
  model: string;
  createdAt: number;
  ttl: number;
  responses: GenerateContentResponse[];
}

export class CachingContentGenerator implements ContentGenerator {
  private cacheDir: string;
  private ttl: number;
  private enabled: boolean;

  constructor(
    private readonly wrapped: ContentGenerator,
    cacheDir: string,
    ttl: number,
    enabled: boolean,
  ) {
    this.cacheDir = cacheDir;
    this.ttl = ttl;
    this.enabled = enabled;
  }

  get userTier(): UserTierId | undefined {
    return this.wrapped.userTier;
  }

  get userTierName(): string | undefined {
    return this.wrapped.userTierName;
  }

  get paidTier(): GeminiUserTier | undefined {
    return this.wrapped.paidTier;
  }

  private buildCacheKey(req: GenerateContentParameters): string {
    const payload = JSON.stringify({
      model: req.model,
      contents: req.contents,
      config: req.config,
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  private getCacheFilePath(key: string): string {
    return path.join(this.cacheDir, `${key}.json`);
  }

  private async loadFromCache(
    key: string,
  ): Promise<GenerateContentResponse[] | null> {
    try {
      const filePath = this.getCacheFilePath(key);
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const entry = JSON.parse(raw) as CacheEntry;
      const age = Date.now() - entry.createdAt;
      if (age > entry.ttl) {
        await fs.promises.unlink(filePath).catch(() => {});
        return null;
      }
      return entry.responses;
    } catch {
      return null;
    }
  }

  private async saveToCache(
    key: string,
    model: string,
    responses: GenerateContentResponse[],
  ): Promise<void> {
    try {
      await fs.promises.mkdir(this.cacheDir, { recursive: true });
      const entry: CacheEntry = {
        key,
        model,
        createdAt: Date.now(),
        ttl: this.ttl,
        responses,
      };
      const filePath = this.getCacheFilePath(key);
      await fs.promises.writeFile(filePath, JSON.stringify(entry), 'utf-8');
    } catch {
      // Cache write failures are non-fatal
    }
  }

  async generateContent(
    req: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<GenerateContentResponse> {
    if (!this.enabled) {
      return this.wrapped.generateContent(req, userPromptId, role);
    }
    const key = this.buildCacheKey(req);
    const cached = await this.loadFromCache(key);
    if (cached && cached.length > 0) {
      debugLogger.debug(
        `[PromptCache] Cache HIT for model=${req.model} key=${key.slice(0, 12)}...`,
      );
      return cached[0];
    }
    debugLogger.debug(
      `[PromptCache] Cache MISS for model=${req.model} key=${key.slice(0, 12)}...`,
    );
    const response = await this.wrapped.generateContent(
      req,
      userPromptId,
      role,
    );
    await this.saveToCache(key, req.model, [response]);
    return response;
  }

  async generateContentStream(
    req: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    if (!this.enabled) {
      return this.wrapped.generateContentStream(req, userPromptId, role);
    }
    const key = this.buildCacheKey(req);
    const cached = await this.loadFromCache(key);
    if (cached) {
      debugLogger.debug(
        `[PromptCache] Cache HIT (stream) for model=${req.model} key=${key.slice(0, 12)}...`,
      );
      return this.streamFromCache(cached);
    }
    debugLogger.debug(
      `[PromptCache] Cache MISS (stream) for model=${req.model} key=${key.slice(0, 12)}...`,
    );
    const stream = await this.wrapped.generateContentStream(
      req,
      userPromptId,
      role,
    );
    return this.cachingStream(stream, key, req.model);
  }

  private async *streamFromCache(
    responses: GenerateContentResponse[],
  ): AsyncGenerator<GenerateContentResponse> {
    for (const response of responses) {
      yield response;
    }
  }

  private async *cachingStream(
    stream: AsyncGenerator<GenerateContentResponse>,
    key: string,
    model: string,
  ): AsyncGenerator<GenerateContentResponse> {
    const collected: GenerateContentResponse[] = [];
    let completed = false;
    try {
      for await (const chunk of stream) {
        collected.push(chunk);
        yield chunk;
      }
      completed = true;
    } finally {
      if (completed && collected.length > 0) {
        await this.saveToCache(key, model, collected);
      }
    }
  }

  async countTokens(req: CountTokensParameters): Promise<CountTokensResponse> {
    return this.wrapped.countTokens(req);
  }

  async embedContent(
    req: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    return this.wrapped.embedContent(req);
  }
}
