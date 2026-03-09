/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mocked } from 'vitest';
import { CachingContentGenerator } from './cachingContentGenerator.js';
import type { ContentGenerator } from './contentGenerator.js';
import { PromptCache } from '../cache/prompt-cache.js';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import { LlmRole } from '../telemetry/llmRole.js';

vi.mock('../cache/prompt-cache.js');

describe('CachingContentGenerator', () => {
  let mockRealGenerator: ContentGenerator;
  let mockPromptCache: Mocked<PromptCache>;
  let generator: CachingContentGenerator;
  const projectPath = '/mock/project/path';

  const mockRequest: GenerateContentParameters = {
    model: 'gemini-1.5-pro',
    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
  };

  const mockResponse: GenerateContentResponse = {
    candidates: [{ content: { role: 'model', parts: [{ text: 'Response' }] } }],
  } as GenerateContentResponse;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRealGenerator = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
      userTier: undefined,
      userTierName: undefined,
      paidTier: undefined,
    } as unknown as ContentGenerator;

    mockPromptCache = {
      get: vi.fn(),
      set: vi.fn(),
    } as unknown as Mocked<PromptCache>;

    vi.mocked(PromptCache).mockImplementation(
      () => mockPromptCache as unknown as PromptCache,
    );
    generator = new CachingContentGenerator(mockRealGenerator, projectPath);
  });

  it('delegates to the real generator and stores response if cache misses on generateContent', async () => {
    mockPromptCache.get.mockReturnValue(null);
    vi.mocked(mockRealGenerator.generateContent).mockResolvedValue(
      mockResponse,
    );

    const result = await generator.generateContent(
      mockRequest,
      'prompt-1',
      LlmRole.MAIN,
    );

    expect(mockPromptCache.get).toHaveBeenCalledWith(
      mockRequest,
      mockRequest.model,
    );
    expect(mockRealGenerator.generateContent).toHaveBeenCalledWith(
      mockRequest,
      'prompt-1',
      LlmRole.MAIN,
    );
    expect(mockPromptCache.set).toHaveBeenCalledWith(
      mockRequest,
      mockRequest.model,
      mockResponse,
    );
    expect(result).toBe(mockResponse);
  });

  it('returns cached response directly without calling real generator on cache hit for generateContent', async () => {
    mockPromptCache.get.mockReturnValue(mockResponse);

    const result = await generator.generateContent(
      mockRequest,
      'prompt-1',
      LlmRole.MAIN,
    );

    expect(mockPromptCache.get).toHaveBeenCalledWith(
      mockRequest,
      mockRequest.model,
    );
    expect(mockRealGenerator.generateContent).not.toHaveBeenCalled();
    expect(mockPromptCache.set).not.toHaveBeenCalled();
    expect(result).toBe(mockResponse);
  });

  it('delegates to the real generator and caches gathered chunks if cache misses on generateContentStream', async () => {
    mockPromptCache.get.mockReturnValue(null);

    const chunk1 = {
      candidates: [{ content: { parts: [{ text: 'Hello ' }] } }],
    } as GenerateContentResponse;
    const chunk2 = {
      candidates: [{ content: { parts: [{ text: 'World' }] } }],
    } as GenerateContentResponse;

    async function* mockStream() {
      yield chunk1;
      yield chunk2;
    }
    vi.mocked(mockRealGenerator.generateContentStream).mockResolvedValue(
      mockStream(),
    );

    const resultStream = await generator.generateContentStream(
      mockRequest,
      'prompt-1',
      LlmRole.MAIN,
    );
    const gatheredChunks: GenerateContentResponse[] = [];
    for await (const chunk of resultStream) {
      gatheredChunks.push(chunk);
    }

    expect(mockRealGenerator.generateContentStream).toHaveBeenCalled();
    expect(gatheredChunks).toEqual([chunk1, chunk2]);
    // It should have recorded the chunks as an array in the cache
    expect(mockPromptCache.set).toHaveBeenCalledWith(
      mockRequest,
      mockRequest.model,
      [chunk1, chunk2],
    );
  });

  it('returns cached chunks as a stream on cache hit (array) for generateContentStream', async () => {
    const cachedChunks = [
      {
        candidates: [{ content: { parts: [{ text: 'Hello ' }] } }],
      } as GenerateContentResponse,
      {
        candidates: [{ content: { parts: [{ text: 'World' }] } }],
      } as GenerateContentResponse,
    ];
    mockPromptCache.get.mockReturnValue(cachedChunks);

    const resultStream = await generator.generateContentStream(
      mockRequest,
      'prompt-1',
      LlmRole.MAIN,
    );
    const gatheredChunks: GenerateContentResponse[] = [];
    for await (const chunk of resultStream) {
      gatheredChunks.push(chunk);
    }

    expect(mockRealGenerator.generateContentStream).not.toHaveBeenCalled();
    expect(gatheredChunks).toEqual(cachedChunks);
  });
});
