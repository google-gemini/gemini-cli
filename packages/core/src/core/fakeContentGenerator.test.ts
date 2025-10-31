/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FakeContentGenerator,
  type FakeResponse,
} from './fakeContentGenerator.js';
import { promises } from 'node:fs';
import {
  GenerateContentResponse,
  type CountTokensResponse,
  type EmbedContentResponse,
  type GenerateContentParameters,
  type CountTokensParameters,
  type EmbedContentParameters,
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
  const fakeGenerateContentResponse: FakeResponse = {
    method: 'generateContent',
    response: {
      candidates: [
        { content: { parts: [{ text: 'response1' }], role: 'model' } },
      ],
    } as GenerateContentResponse,
  };

  const fakeGenerateContentStreamResponse: FakeResponse = {
    method: 'generateContentStream',
    response: [
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
    ] as GenerateContentResponse[],
  };

  const fakeCountTokensResponse: FakeResponse = {
    method: 'countTokens',
    response: { totalTokens: 10 } as CountTokensResponse,
  };

  const fakeEmbedContentResponse: FakeResponse = {
    method: 'embedContent',
    response: {
      embeddings: [{ values: [1, 2, 3] }],
    } as EmbedContentResponse,
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return responses for generateContent', async () => {
    const generator = new FakeContentGenerator([fakeGenerateContentResponse]);
    const response = await generator.generateContent(
      {} as GenerateContentParameters,
      'id',
    );
    expect(response).instanceOf(GenerateContentResponse);
    expect(response).toEqual(fakeGenerateContentResponse.response);
  });

  it('should return responses for generateContentStream', async () => {
    const generator = new FakeContentGenerator([
      fakeGenerateContentStreamResponse,
    ]);
    const stream = await generator.generateContentStream(
      {} as GenerateContentParameters,
      'id',
    );
    const responses = [];
    for await (const response of stream) {
      expect(response).instanceOf(GenerateContentResponse);
      responses.push(response);
    }
    expect(responses).toEqual(fakeGenerateContentStreamResponse.response);
  });

  it('should return responses for countTokens', async () => {
    const generator = new FakeContentGenerator([fakeCountTokensResponse]);
    const response = await generator.countTokens({} as CountTokensParameters);
    expect(response).toEqual(fakeCountTokensResponse.response);
  });

  it('should return responses for embedContent', async () => {
    const generator = new FakeContentGenerator([fakeEmbedContentResponse]);
    const response = await generator.embedContent({} as EmbedContentParameters);
    expect(response).toEqual(fakeEmbedContentResponse.response);
  });

  it('should handle a mixture of calls', async () => {
    const fakeResponses = [
      fakeGenerateContentResponse,
      fakeGenerateContentStreamResponse,
      fakeCountTokensResponse,
      fakeEmbedContentResponse,
    ];
    const generator = new FakeContentGenerator(fakeResponses);
    for (const fakeResponse of fakeResponses) {
      const response = await generator[fakeResponse.method]({} as never, '');
      if (fakeResponse.method === 'generateContentStream') {
        const responses = [];
        for await (const item of response as AsyncGenerator<GenerateContentResponse>) {
          expect(item).instanceOf(GenerateContentResponse);
          responses.push(item);
        }
        expect(responses).toEqual(fakeResponse.response);
      } else {
        expect(response).toEqual(fakeResponse.response);
      }
    }
  });

  it('should throw error when no more responses', async () => {
    const generator = new FakeContentGenerator([fakeGenerateContentResponse]);
    await generator.generateContent({} as GenerateContentParameters, 'id');
    await expect(
      generator.embedContent({} as EmbedContentParameters),
    ).rejects.toThrowError('No more mock responses for embedContent');
    await expect(
      generator.countTokens({} as CountTokensParameters),
    ).rejects.toThrowError('No more mock responses for countTokens');
    await expect(
      generator.generateContentStream({} as GenerateContentParameters, 'id'),
    ).rejects.toThrow('No more mock responses for generateContentStream');
    await expect(
      generator.generateContent({} as GenerateContentParameters, 'id'),
    ).rejects.toThrowError('No more mock responses for generateContent');
  });

  describe('fromFile', () => {
    it('should create a generator from a file', async () => {
      const fileContent = JSON.stringify(fakeGenerateContentResponse) + '\n';
      mockReadFile.mockResolvedValue(fileContent);

      const generator = await FakeContentGenerator.fromFile('fake-path.json');
      const response = await generator.generateContent(
        {} as GenerateContentParameters,
        'id',
      );
      expect(response).toEqual(fakeGenerateContentResponse.response);
    });
  });
});
