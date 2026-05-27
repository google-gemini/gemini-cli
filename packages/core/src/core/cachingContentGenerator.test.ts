/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensResponse,
  EmbedContentResponse,
} from '@google/genai';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as fs from 'node:fs';
import type { ContentGenerator } from './contentGenerator.js';
import { CachingContentGenerator } from './cachingContentGenerator.js';
import type { Config } from '../config/config.js';
import { LlmRole } from '../telemetry/types.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const mockCache: Record<string, string> = {};
  return {
    ...actual,
    existsSync: vi.fn((p: string) => !!mockCache[p]),
    readFileSync: vi.fn((p: string) => {
      if (mockCache[p]) return mockCache[p];
      throw new Error('ENOENT');
    }),
    writeFileSync: vi.fn((p: string, data: string) => {
      mockCache[p] = data;
    }),
    mkdirSync: vi.fn(),
    // Allow internal mock cache reset
    _reset: () => {
      for (const k of Object.keys(mockCache)) {
        delete mockCache[k];
      }
    },
  };
});

describe('CachingContentGenerator', () => {
  let mockRealGenerator: ContentGenerator;
  let mockConfig: Config;
  let cachingGenerator: CachingContentGenerator;
  const projectRoot = '/test/project';

  beforeEach(() => {
    (fs as unknown as { _reset: () => void })._reset();
    mockRealGenerator = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
    };
    mockConfig = {
      storage: {
        getProjectRoot: () => projectRoot,
      },
      getDebugMode: () => true,
    } as unknown as Config;

    cachingGenerator = new CachingContentGenerator(
      mockRealGenerator,
      mockConfig,
    );
    vi.clearAllMocks();
  });

  it('should call actual generator and store in cache on cache miss', async () => {
    const req = {
      model: 'gemini-model',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    } as GenerateContentParameters;

    const mockResponse = {
      candidates: [{ content: { parts: [{ text: 'world' }] } }],
    } as GenerateContentResponse;

    (mockRealGenerator.generateContent as Mock).mockResolvedValue(mockResponse);

    const response = await cachingGenerator.generateContent(
      req,
      'prompt-id',
      LlmRole.MAIN,
    );
    expect(response).toEqual(mockResponse);
    expect(mockRealGenerator.generateContent).toHaveBeenCalledTimes(1);

    // Second call should hit cache and NOT call the actual generator again
    const secondResponse = await cachingGenerator.generateContent(
      req,
      'prompt-id',
      LlmRole.MAIN,
    );
    expect(secondResponse).toEqual(mockResponse);
    expect(mockRealGenerator.generateContent).toHaveBeenCalledTimes(1);
  });

  it('should handle streaming and cache stream responses upon success', async () => {
    const req = {
      model: 'gemini-model',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    } as GenerateContentParameters;

    const mockResponse1 = {
      candidates: [{ content: { parts: [{ text: 'hello ' }] } }],
    } as GenerateContentResponse;
    const mockResponse2 = {
      candidates: [{ content: { parts: [{ text: 'world' }] } }],
    } as GenerateContentResponse;

    async function* mockStream() {
      yield mockResponse1;
      yield mockResponse2;
    }

    (mockRealGenerator.generateContentStream as Mock).mockResolvedValue(
      mockStream(),
    );

    const stream = await cachingGenerator.generateContentStream(
      req,
      'prompt-id',
      LlmRole.MAIN,
    );
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([mockResponse1, mockResponse2]);
    expect(mockRealGenerator.generateContentStream).toHaveBeenCalledTimes(1);

    // Second stream call should hit cache and yield identical chunks without calling model again
    const secondStream = await cachingGenerator.generateContentStream(
      req,
      'prompt-id',
      LlmRole.MAIN,
    );
    const secondChunks = [];
    for await (const chunk of secondStream) {
      secondChunks.push(chunk);
    }
    expect(secondChunks).toEqual([mockResponse1, mockResponse2]);
    expect(mockRealGenerator.generateContentStream).toHaveBeenCalledTimes(1);
  });

  it('should forward countTokens and embedContent directly', async () => {
    const countResponse = { totalTokens: 5 } as CountTokensResponse;
    const embedResponse = { embeddings: [] } as EmbedContentResponse;

    (mockRealGenerator.countTokens as Mock).mockResolvedValue(countResponse);
    (mockRealGenerator.embedContent as Mock).mockResolvedValue(embedResponse);

    const tokens = await cachingGenerator.countTokens({
      model: 'gemini-model',
      contents: [],
    });
    const embeddings = await cachingGenerator.embedContent({
      model: 'gemini-model',
      contents: [],
    });

    expect(tokens).toEqual(countResponse);
    expect(embeddings).toEqual(embedResponse);
  });
});
