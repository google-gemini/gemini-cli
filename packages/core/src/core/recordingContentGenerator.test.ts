/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentResponse,
  CountTokensResponse,
  EmbedContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentParameters,
  ContentEmbedding,
} from '@google/genai';
import { appendFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';
import type { ContentGenerator } from './contentGenerator.js';
import { RecordingContentGenerator } from './recordingContentGenerator.js';

vi.mock('node:fs', () => ({
  appendFileSync: vi.fn(),
}));

describe('RecordingContentGenerator', () => {
  let mockRealGenerator: ContentGenerator;
  let recorder: RecordingContentGenerator;
  const filePath = '/test/file/responses.json';

  beforeEach(() => {
    mockRealGenerator = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
    };
    recorder = new RecordingContentGenerator(mockRealGenerator, filePath);
    vi.clearAllMocks();
  });

  it('should record generateContent responses', async () => {
    const mockResponse = {
      candidates: [
        { content: { parts: [{ text: 'response' }], role: 'model' } },
      ],
      usageMetadata: { totalTokenCount: 10 },
    } as GenerateContentResponse;
    (mockRealGenerator.generateContent as Mock).mockResolvedValue(mockResponse);

    const response = await recorder.generateContent(
      {} as GenerateContentParameters,
      'id1',
    );
    expect(response).toEqual(mockResponse);
    expect(mockRealGenerator.generateContent).toHaveBeenCalledWith({}, 'id1');

    expect(appendFileSync).toHaveBeenCalledWith(
      filePath,
      safeJsonStringify({
        method: 'generateContent',
        response: mockResponse,
      }) + '\n',
    );
  });

  it('should record generateContentStream responses', async () => {
    const mockResponse1 = {
      candidates: [
        { content: { parts: [{ text: 'response1' }], role: 'model' } },
      ],
      usageMetadata: { totalTokenCount: 10 },
    } as GenerateContentResponse;
    const mockResponse2 = {
      candidates: [
        { content: { parts: [{ text: 'response2' }], role: 'model' } },
      ],
      usageMetadata: { totalTokenCount: 20 },
    } as GenerateContentResponse;

    async function* mockStream() {
      yield mockResponse1;
      yield mockResponse2;
    }

    (mockRealGenerator.generateContentStream as Mock).mockResolvedValue(
      mockStream(),
    );

    const stream = await recorder.generateContentStream(
      {} as GenerateContentParameters,
      'id1',
    );
    const responses = [];
    for await (const response of stream) {
      responses.push(response);
    }

    expect(responses).toEqual([mockResponse1, mockResponse2]);
    expect(mockRealGenerator.generateContentStream).toHaveBeenCalledWith(
      {},
      'id1',
    );

    expect(appendFileSync).toHaveBeenCalledWith(
      filePath,
      safeJsonStringify({
        method: 'generateContentStream',
        response: responses,
      }) + '\n',
    );
  });

  it('should record countTokens responses', async () => {
    const mockResponse = {
      totalTokens: 100,
      cachedContentTokenCount: 10,
    } as CountTokensResponse;
    (mockRealGenerator.countTokens as Mock).mockResolvedValue(mockResponse);

    const response = await recorder.countTokens({} as CountTokensParameters);
    expect(response).toEqual(mockResponse);
    expect(mockRealGenerator.countTokens).toHaveBeenCalledWith({});

    expect(appendFileSync).toHaveBeenCalledWith(
      filePath,
      safeJsonStringify({
        method: 'countTokens',
        response: mockResponse,
      }) + '\n',
    );
  });

  it('should record embedContent responses', async () => {
    const mockResponse = {
      embeddings: [{ values: [1, 2, 3] } as ContentEmbedding],
    } as EmbedContentResponse;
    (mockRealGenerator.embedContent as Mock).mockResolvedValue(mockResponse);

    const response = await recorder.embedContent({} as EmbedContentParameters);
    expect(response).toEqual(mockResponse);
    expect(mockRealGenerator.embedContent).toHaveBeenCalledWith({});
    expect(appendFileSync).toHaveBeenCalledWith(
      filePath,
      safeJsonStringify({
        method: 'embedContent',
        response: mockResponse,
      }) + '\n',
    );
  });
});
