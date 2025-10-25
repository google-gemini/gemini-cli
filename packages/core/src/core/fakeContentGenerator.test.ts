/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeContentGenerator } from './fakeContentGenerator.js';
import { promises } from 'node:fs';
import type { FakeResponses } from './fakeContentGenerator.js';
import type {
  GenerateContentResponse,
  CountTokensResponse,
  EmbedContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentParameters,
} from '@google/genai';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
    },
  };
});

const mockReadFile = vi.mocked(promises.readFile);

describe('FakeContentGenerator', () => {
  const fakeResponses: FakeResponses = {
    generateContent: [
      {
        candidates: [
          { content: { parts: [{ text: 'response1' }], role: 'model' } },
        ],
      },
    ] as GenerateContentResponse[],
    generateContentStream: [
      [
        {
          candidates: [
            { content: { parts: [{ text: 'chunk1' }], role: 'model' } },
          ],
        },
        {
          candidates: [
            { content: { parts: [{ text: 'chunk2' }], role: 'model' } },
          ],
        },
      ],
    ] as GenerateContentResponse[][],
    countTokens: [{ totalTokens: 10 }] as CountTokensResponse[],
    embedContent: [
      { embeddings: [{ values: [1, 2, 3] }] },
    ] as EmbedContentResponse[],
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return responses for generateContent', async () => {
    const generator = new FakeContentGenerator(fakeResponses);
    const response = await generator.generateContent(
      {} as GenerateContentParameters,
      'id',
    );
    expect(response).toEqual(fakeResponses.generateContent[0]);
  });

  it('should throw error when no more generateContent responses', async () => {
    const generator = new FakeContentGenerator({
      ...fakeResponses,
      generateContent: [],
    });
    await expect(
      generator.generateContent({} as GenerateContentParameters, 'id'),
    ).rejects.toThrowError('No more mock responses for generateContent');
  });

  it('should return responses for generateContentStream', async () => {
    const generator = new FakeContentGenerator(fakeResponses);
    const stream = await generator.generateContentStream(
      {} as GenerateContentParameters,
      'id',
    );
    const responses = [];
    for await (const response of stream) {
      responses.push(response);
    }
    expect(responses).toEqual(fakeResponses.generateContentStream[0]);
  });

  it('should throw error when no more generateContentStream responses', async () => {
    const generator = new FakeContentGenerator({
      ...fakeResponses,
      generateContentStream: [],
    });
    await expect(
      generator.generateContentStream({} as GenerateContentParameters, 'id'),
    ).rejects.toThrow('No more mock responses for generateContentStream');
  });

  it('should return responses for countTokens', async () => {
    const generator = new FakeContentGenerator(fakeResponses);
    const response = await generator.countTokens({} as CountTokensParameters);
    expect(response).toEqual(fakeResponses.countTokens[0]);
  });

  it('should throw error when no more countTokens responses', async () => {
    const generator = new FakeContentGenerator({
      ...fakeResponses,
      countTokens: [],
    });
    await expect(
      generator.countTokens({} as CountTokensParameters),
    ).rejects.toThrowError('No more mock responses for countTokens');
  });

  it('should return responses for embedContent', async () => {
    const generator = new FakeContentGenerator(fakeResponses);
    const response = await generator.embedContent({} as EmbedContentParameters);
    expect(response).toEqual(fakeResponses.embedContent[0]);
  });

  it('should throw error when no more embedContent responses', async () => {
    const generator = new FakeContentGenerator({
      ...fakeResponses,
      embedContent: [],
    });
    await expect(
      generator.embedContent({} as EmbedContentParameters),
    ).rejects.toThrowError('No more mock responses for embedContent');
  });

  it('should handle multiple calls and exhaust responses', async () => {
    const generator = new FakeContentGenerator(fakeResponses);
    await generator.generateContent({} as GenerateContentParameters, 'id');
    await expect(
      generator.generateContent({} as GenerateContentParameters, 'id'),
    ).rejects.toThrow();
  });

  describe('fromFile', () => {
    it('should create a generator from a file', async () => {
      const fileContent = JSON.stringify(fakeResponses);
      mockReadFile.mockResolvedValue(fileContent);

      const generator = await FakeContentGenerator.fromFile('fake-path.json');
      const response = await generator.generateContent(
        {} as GenerateContentParameters,
        'id',
      );
      expect(response).toEqual(fakeResponses.generateContent[0]);
    });
  });

  describe('constructor with partial responses', () => {
    it('should handle missing generateContent', async () => {
      const responses = { ...fakeResponses, generateContent: undefined };
      const generator = new FakeContentGenerator(
        responses as unknown as FakeResponses,
      );
      await expect(
        generator.generateContent({} as GenerateContentParameters, 'id'),
      ).rejects.toThrowError('No more mock responses for generateContent');
    });

    it('should handle missing generateContentStream', async () => {
      const responses = { ...fakeResponses, generateContentStream: undefined };
      const generator = new FakeContentGenerator(
        responses as unknown as FakeResponses,
      );
      await expect(
        generator.generateContentStream({} as GenerateContentParameters, 'id'),
      ).rejects.toThrowError(
        'No more mock responses for generateContentStream',
      );
    });

    it('should handle missing countTokens', async () => {
      const responses = { ...fakeResponses, countTokens: undefined };
      const generator = new FakeContentGenerator(
        responses as unknown as FakeResponses,
      );
      await expect(
        generator.countTokens({} as CountTokensParameters),
      ).rejects.toThrowError('No more mock responses for countTokens');
    });

    it('should handle missing embedContent', async () => {
      const responses = { ...fakeResponses, embedContent: undefined };
      const generator = new FakeContentGenerator(
        responses as unknown as FakeResponses,
      );
      await expect(
        generator.embedContent({} as EmbedContentParameters),
      ).rejects.toThrowError('No more mock responses for embedContent');
    });
  });
});
