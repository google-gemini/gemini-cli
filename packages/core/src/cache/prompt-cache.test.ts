/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { PromptCache } from './prompt-cache.js';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';

vi.mock('node:fs');

describe('PromptCache', () => {
  const mockProjectPath = '/mock/project/path';

  let promptCache: PromptCache;
  let mockRequest: GenerateContentParameters;
  let mockResponse: GenerateContentResponse;

  beforeEach(() => {
    vi.clearAllMocks();
    promptCache = new PromptCache(mockProjectPath);

    mockRequest = {
      model: 'gemini-1.5-pro',
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
    };

    mockResponse = {
      candidates: [
        {
          content: { role: 'model', parts: [{ text: 'Hi there' }] },
        },
      ],
    } as GenerateContentResponse;
  });

  it('should return null when cache file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = promptCache.get(mockRequest, 'gemini-1.5-pro');
    expect(result).toBeNull();
  });

  it('should return cached response on hit', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    let writtenData: string | undefined;

    vi.mocked(fs.writeFileSync).mockImplementation((_path, data) => {
      writtenData = data as string;
    });

    vi.mocked(fs.readFileSync).mockImplementation(() => writtenData || '{}');

    expect(promptCache.get(mockRequest, 'gemini-1.5-pro')).toBeNull();

    promptCache.set(mockRequest, 'gemini-1.5-pro', mockResponse);

    expect(writtenData).toBeDefined();
    expect(promptCache.get(mockRequest, 'gemini-1.5-pro')).toEqual(
      mockResponse,
    );
  });

  it('should evict oldest entries when cache exceeds 100 items', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dummyCache: Record<string, any> = {};
    for (let i = 0; i < 100; i++) {
      dummyCache[`hash-${i}`] = {
        hash: `hash-${i}`,
        response: {} as GenerateContentResponse,
        timestamp: 1000 + i, // hash-0 is oldest
        model: 'gemini-1.5-pro',
        projectPath: mockProjectPath,
      };
    }

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(dummyCache));

    promptCache.set(mockRequest, 'gemini-1.5-pro', mockResponse);

    expect(fs.writeFileSync).toHaveBeenCalled();
    const writeCalls = vi.mocked(fs.writeFileSync).mock.calls;
    const writtenJson = writeCalls[0][1] as string;
    const savedCache = JSON.parse(writtenJson);

    expect(Object.keys(savedCache).length).toBe(81);
    expect(savedCache['hash-0']).toBeUndefined();
    expect(savedCache['hash-99']).toBeDefined();
  });
});
