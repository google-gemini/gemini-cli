/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import type { ContentGenerator } from './contentGenerator.js';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
} from '@google/genai';
import type { LlmRole } from '../telemetry/llmRole.js';
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { UserTierId, GeminiUserTier } from '../code_assist/types.js';

interface CacheEntry {
  promptHash: string;
  originalPrompt: GenerateContentParameters;
  response?: GenerateContentResponse;
  streamResponses?: GenerateContentResponse[];
  timestamp: number;
  projectPath: string;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class CachingContentGenerator implements ContentGenerator {
  private readonly cacheFilePath: string;

  constructor(
    private readonly wrapped: ContentGenerator,
    private readonly config: Config,
  ) {
    this.cacheFilePath = path.join(
      this.config.storage.getProjectRoot(),
      '.cache',
      'prompt-cache.json',
    );
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

  private generatePromptHash(
    req: GenerateContentParameters,
    projectPath: string,
  ): string {
    const data = JSON.stringify({
      model: req.model,
      contents: req.contents,
      config: req.config,
      projectPath,
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private readCache(): Record<string, CacheEntry> {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const content = fs.readFileSync(this.cacheFilePath, 'utf8');
         
        const cache = JSON.parse(content) as Record<string, CacheEntry>;

        // Prune expired entries
        const now = Date.now();
        let changed = false;
        for (const [key, entry] of Object.entries(cache)) {
          if (now - entry.timestamp > DEFAULT_TTL_MS) {
            delete cache[key];
            changed = true;
          }
        }
        if (changed) {
          this.writeCache(cache);
        }
        return cache;
      }
    } catch (e) {
      debugLogger.debug('[Prompt Replay Cache] Error reading cache file:', e);
    }
    return {};
  }

  private writeCache(cache: Record<string, CacheEntry>): void {
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.cacheFilePath,
        JSON.stringify(cache, null, 2),
        'utf8',
      );
    } catch (e) {
      debugLogger.debug('[Prompt Replay Cache] Error writing cache file:', e);
    }
  }

  async generateContent(
    req: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<GenerateContentResponse> {
    const projectPath = this.config.storage.getProjectRoot();
    const promptHash = this.generatePromptHash(req, projectPath);
    const cache = this.readCache();

    const cachedEntry = cache[promptHash];
    if (
      cachedEntry &&
      cachedEntry.response &&
      Date.now() - cachedEntry.timestamp <= DEFAULT_TTL_MS
    ) {
      if (this.config.getDebugMode()) {
        debugLogger.log(
          `[Prompt Replay Cache] Cache hit (non-stream) for prompt hash: ${promptHash}`,
        );
      }
      return cachedEntry.response;
    }

    if (this.config.getDebugMode()) {
      debugLogger.log(
        `[Prompt Replay Cache] Cache miss (non-stream) for prompt hash: ${promptHash}`,
      );
    }

    const response = await this.wrapped.generateContent(
      req,
      userPromptId,
      role,
    );

    cache[promptHash] = {
      promptHash,
      originalPrompt: req,
      response,
      timestamp: Date.now(),
      projectPath,
    };
    this.writeCache(cache);

    return response;
  }

  async generateContentStream(
    req: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const projectPath = this.config.storage.getProjectRoot();
    const promptHash = this.generatePromptHash(req, projectPath);
    const cache = this.readCache();

    const cachedEntry = cache[promptHash];
    if (
      cachedEntry &&
      cachedEntry.streamResponses &&
      Date.now() - cachedEntry.timestamp <= DEFAULT_TTL_MS
    ) {
      if (this.config.getDebugMode()) {
        debugLogger.log(
          `[Prompt Replay Cache] Cache hit (stream) for prompt hash: ${promptHash}`,
        );
      }
      const responses = cachedEntry.streamResponses;
      return (async function* () {
        for (const res of responses) {
          yield res;
        }
      })();
    }

    if (this.config.getDebugMode()) {
      debugLogger.log(
        `[Prompt Replay Cache] Cache miss (stream) for prompt hash: ${promptHash}`,
      );
    }

    const stream = await this.wrapped.generateContentStream(
      req,
      userPromptId,
      role,
    );
    const accumulatedResponses: GenerateContentResponse[] = [];

    const readCache = () => this.readCache();
    const writeCache = (c: Record<string, CacheEntry>) => this.writeCache(c);

    return (async function* () {
      for await (const chunk of stream) {
        accumulatedResponses.push(chunk);
        yield chunk;
      }

      // Store in cache upon successful stream completion
      const finalCache = readCache();
      finalCache[promptHash] = {
        promptHash,
        originalPrompt: req,
        streamResponses: accumulatedResponses,
        timestamp: Date.now(),
        projectPath,
      };
      writeCache(finalCache);
    })();
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
