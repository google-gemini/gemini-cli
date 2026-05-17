/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { geminiToOpenAiRequest } from './geminiToOpenAiTranslator.js';

describe('geminiToOpenAiRequest', () => {
  it('prefers parametersJsonSchema when translating tools', () => {
    const request = geminiToOpenAiRequest({
      model: 'gemma4:26b',
      contents: [{ role: 'user', parts: [{ text: 'inspect repo' }] }],
      config: {
        tools: [
          {
            functionDeclarations: [
              {
                name: 'read_file',
                description: 'Read a file',
                parameters: {
                  type: 'object',
                  properties: [],
                },
                parametersJsonSchema: {
                  type: 'object',
                  properties: {
                    file_path: {
                      type: 'string',
                    },
                  },
                  required: ['file_path'],
                },
              } as never,
            ],
          },
        ],
      },
    });

    expect(request.tools?.[0]?.function.parameters).toEqual({
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
        },
      },
      required: ['file_path'],
    });
  });

  it('normalizes Gemini-style parameter schemas for OpenAI-compatible backends', () => {
    const request = geminiToOpenAiRequest({
      model: 'gemma4:26b',
      contents: [{ role: 'user', parts: [{ text: 'search workspace' }] }],
      config: {
        tools: [
          {
            functionDeclarations: [
              {
                name: 'grep_search',
                description: 'Search text',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    query: {
                      type: 'STRING',
                    },
                    options: {
                      type: 'OBJECT',
                      properties: [],
                    },
                  },
                  required: ['query', 42],
                } as unknown as never,
              } as never,
            ],
          },
        ],
      },
    });

    expect(request.tools?.[0]?.function.parameters).toEqual({
      type: 'object',
      properties: {
        query: {
          type: 'string',
        },
        options: {
          type: 'object',
          properties: {},
        },
      },
      required: ['query'],
    });
  });
});
