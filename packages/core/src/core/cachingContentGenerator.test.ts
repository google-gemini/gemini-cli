/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import { CachingContentGenerator } from './cachingContentGenerator.js';
import type { ContentGenerator } from './contentGenerator.js';

function createMockGenerator(): ContentGenerator {
  let callCount = 0;
  const mockResponse: Record<string, unknown> = {
    candidates: [{ content: { parts: [{ text: 'hello' }], role: 'model' } }],
  };
  return {
    generateContent: vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ...mockResponse,
        _callCount: callCount,
      } as unknown as GenerateContentResponse;
    }),
    generateContentStream: vi.fn().mockImplementation(async () => {
      callCount++;
      return (async function* () {
        yield {
          ...mockResponse,
          _callCount: callCount,
        } as unknown as GenerateContentResponse;
      })();
    }),
    countTokens: vi.fn(),
    embedContent: vi.fn(),
  } as unknown as ContentGenerator;
}

describe('CachingContentGenerator', () => {
  const tempDir = path.join(
    os.tmpdir(),
    'gemini-cache-test-' + Math.random().toString(36).slice(2),
  );
  const cacheDir = path.join(tempDir, 'prompt-cache');

  beforeEach(() => {
    fs.mkdirSync(cacheDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const req: GenerateContentParameters = {
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
  };

  it('should return cached response on second call', async () => {
    const mockGen = createMockGenerator();
    const caching = new CachingContentGenerator(
      mockGen,
      cacheDir,
      3600000,
      true,
    );

    const r1 = await caching.generateContent(req, 'prompt1', 'user');
    const r2 = await caching.generateContent(req, 'prompt2', 'user');

    expect(mockGen.generateContent).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(r2);
  });

  it('should bypass cache if disabled', async () => {
    const mockGen = createMockGenerator();
    const caching = new CachingContentGenerator(
      mockGen,
      cacheDir,
      3600000,
      false,
    );

    await caching.generateContent(req, 'prompt1', 'user');
    await caching.generateContent(req, 'prompt2', 'user');

    expect(mockGen.generateContent).toHaveBeenCalledTimes(2);
  });

  it('should cache streaming responses', async () => {
    const mockGen = createMockGenerator();
    const caching = new CachingContentGenerator(
      mockGen,
      cacheDir,
      3600000,
      true,
    );

    const stream1 = await caching.generateContentStream(req, 'prompt1', 'user');
    const collected1: GenerateContentResponse[] = [];
    for await (const chunk of stream1) {
      collected1.push(chunk);
    }

    const stream2 = await caching.generateContentStream(req, 'prompt2', 'user');
    const collected2: GenerateContentResponse[] = [];
    for await (const chunk of stream2) {
      collected2.push(chunk);
    }

    expect(mockGen.generateContentStream).toHaveBeenCalledTimes(1);
    expect(collected1.length).toBe(collected2.length);
  });

  it('should expire cache entries after TTL', async () => {
    const mockGen = createMockGenerator();
    const caching = new CachingContentGenerator(mockGen, cacheDir, 1, true); // 1ms TTL

    await caching.generateContent(req, 'prompt1', 'user');
    await new Promise((r) => setTimeout(r, 10));
    await caching.generateContent(req, 'prompt2', 'user');

    expect(mockGen.generateContent).toHaveBeenCalledTimes(2);
  });

  it('should use different cache keys for different requests', async () => {
    const mockGen = createMockGenerator();
    const caching = new CachingContentGenerator(
      mockGen,
      cacheDir,
      3600000,
      true,
    );

    const req2: GenerateContentParameters = {
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: 'world' }] }],
    };

    await caching.generateContent(req, 'prompt1', 'user');
    await caching.generateContent(req2, 'prompt2', 'user');

    expect(mockGen.generateContent).toHaveBeenCalledTimes(2);
  });
});
