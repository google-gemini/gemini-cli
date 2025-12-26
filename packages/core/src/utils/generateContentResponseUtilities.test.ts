/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  getResponseTextFromParts,
  getFunctionCalls,
  getFunctionCallsFromParts,
  getFunctionCallsAsJson,
  getFunctionCallsFromPartsAsJson,
  getStructuredResponse,
  getStructuredResponseFromParts,
  getCitations,
  convertToFunctionResponse,
} from './generateContentResponseUtilities.js';
import type {
  GenerateContentResponse,
  Part,
  SafetyRating,
  CitationMetadata,
  PartListUnion,
} from '@google/genai';
import { FinishReason } from '@google/genai';
import {
  DEFAULT_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL,
} from '../config/models.js';

const mockTextPart = (text: string): Part => ({ text });
const mockFunctionCallPart = (
  name: string,
  args?: Record<string, unknown>,
): Part => ({
  functionCall: { name, args: args ?? {} },
});

const mockResponse = (
  parts: Part[],
  finishReason: FinishReason = FinishReason.STOP,
  safetyRatings: SafetyRating[] = [],
  citationMetadata?: CitationMetadata,
): GenerateContentResponse => ({
  candidates: [
    {
      content: {
        parts,
        role: 'model',
      },
      index: 0,
      finishReason,
      safetyRatings,
      citationMetadata,
    },
  ],
  promptFeedback: {
    safetyRatings: [],
  },
  text: undefined,
  data: undefined,
  functionCalls: undefined,
  executableCode: undefined,
  codeExecutionResult: undefined,
});

const minimalMockResponse = (
  candidates: GenerateContentResponse['candidates'],
): GenerateContentResponse => ({
  candidates,
  promptFeedback: { safetyRatings: [] },
  text: undefined,
  data: undefined,
  functionCalls: undefined,
  executableCode: undefined,
  codeExecutionResult: undefined,
});

describe('generateContentResponseUtilities', () => {
  describe('convertToFunctionResponse', () => {
    const toolName = 'testTool';
    const callId = 'call1';

    it('should handle simple string llmContent', () => {
      const llmContent = 'Simple text output';
      const result = convertToFunctionResponse(
        toolName,
        callId,
        llmContent,
        DEFAULT_GEMINI_MODEL,
      );
      expect(result).toEqual([
        {
          functionResponse: {
            name: toolName,
            id: callId,
            response: { output: 'Simple text output' },
          },
        },
      ]);
    });

    it('should handle llmContent as a single Part with text', () => {
      const llmContent: Part = { text: 'Text from Part object' };
      const result = convertToFunctionResponse(
        toolName,
        callId,
        llmContent,
        DEFAULT_GEMINI_MODEL,
      );
      expect(result).toEqual([
        {
          functionResponse: {
            name: toolName,
            id: callId,
            response: { output: 'Text from Part object' },
          },
        },
      ]);
    });

    it('should handle llmContent as a PartListUnion array with a single text Part', () => {
      const llmContent: PartListUnion = [{ text: 'Text from array' }];
      const result = convertToFunctionResponse(
        toolName,
        callId,
        llmContent,
        DEFAULT_GEMINI_MODEL,
      );
      expect(result).toEqual([
        {
          functionResponse: {
            name: toolName,
            id: callId,
            response: { output: 'Text from array' },
          },
        },
      ]);
    });

    it('should handle llmContent as a PartListUnion array with multiple Parts', () => {
      const llmContent: PartListUnion = [{ text: 'part1' }, { text: 'part2' }];
      const result = convertToFunctionResponse(
        toolName,
        callId,
        llmContent,
        DEFAULT_GEMINI_MODEL,
      );
      expect(result).toEqual([
        {
          functionResponse: {
            name: toolName,
            id: callId,
            response: { output: 'part1\npart2' },
          },
        },
      ]);
    });

    it('should handle llmContent with fileData for Gemini 3 model (should be siblings)', () => {
      const llmContent: Part = {
        fileData: { mimeType: 'application/pdf', fileUri: 'gs://...' },
      };
      const result = convertToFunctionResponse(
        toolName,
        callId,
        llmContent,
        PREVIEW_GEMINI_MODEL,
      );
      expect(result).toEqual([
        {
          functionResponse: {
            name: toolName,
            id: callId,
            response: { output: 'Binary content provided (1 item(s)).' },
          },
        },
        llmContent,
      ]);
    });

    it('should handle llmContent with inlineData for Gemini 3 model (should be nested)', () => {
      const llmContent: Part = {
        inlineData: { mimeType: 'image/png', data: 'base64...' },
      };
      const result = convertToFunctionResponse(
        toolName,
        callId,
        llmContent,
        PREVIEW_GEMINI_MODEL,
      );
      expect(result).toEqual([
        {
          functionResponse: {
            name: toolName,
            id: callId,
            response: { output: 'Binary content provided (1 item(s)).' },
            parts: [llmContent],
          },
        },
      ]);
    });

    it('should handle llmContent with fileData for non-Gemini 3 models', () => {
      const llmContent: Part = {
        fileData: { mimeType: 'application/pdf', fileUri: 'gs://...' },
      };
      const result = convertToFunctionResponse(
        toolName,
        callId,
        llmContent,
        DEFAULT_GEMINI_MODEL,
      );
      expect(result).toEqual([
        {
          functionResponse: {
            name: toolName,
            id: callId,
            response: { output: 'Binary content provided (1 item(s)).' },
          },
        },
        llmContent,
      ]);
    });

    it('should preserve existing functionResponse metadata', () => {
      const innerId = 'inner-call-id';
      const innerName = 'inner-tool-name';
      const responseMetadata = {
        flags: ['flag1'],
        isError: false,
        customData: { key: 'value' },
      };
      const input: Part = {
        functionResponse: {
          id: innerId,
          name: innerName,
          response: responseMetadata,
        },
      };

      const result = convertToFunctionResponse(
        toolName,
        callId,
        input,
        DEFAULT_GEMINI_MODEL,
      );

      expect(result).toHaveLength(1);
      expect(result[0].functionResponse).toEqual({
        id: callId,
        name: toolName,
        response: responseMetadata,
      });
    });

    it('should handle llmContent as an array of multiple Parts (text and inlineData)', () => {
      const llmContent: PartListUnion = [
        { text: 'Some textual description' },
        { inlineData: { mimeType: 'image/jpeg', data: 'base64data...' } },
        { text: 'Another text part' },
      ];
      const result = convertToFunctionResponse(
        toolName,
        callId,
        llmContent,
        PREVIEW_GEMINI_MODEL,
      );
      expect(result).toEqual([
        {
          functionResponse: {
            name: toolName,
            id: callId,
            response: {
              output: 'Some textual description\nAnother text part',
            },
            parts: [
              {
                inlineData: { mimeType: 'image/jpeg', data: 'base64data...' },
              },
            ],
          },
        },
      ]);
    });

    it('should handle llmContent as an array with a single inlineData Part', () => {
      const llmContent: PartListUnion = [
        { inlineData: { mimeType: 'image/gif', data: 'gifdata...' } },
      ];
      const result = convertToFunctionResponse(
        toolName,
        callId,
        llmContent,
        PREVIEW_GEMINI_MODEL,
      );
      expect(result).toEqual([
        {
          functionResponse: {
            name: toolName,
            id: callId,
            response: { output: 'Binary content provided (1 item(s)).' },
            parts: llmContent,
          },
        },
      ]);
    });

    it('should handle llmContent as a generic Part (not text, inlineData, or fileData)', () => {
      const llmContent: Part = { functionCall: { name: 'test', args: {} } };
      const result = convertToFunctionResponse(
        toolName,
        callId,
        llmContent,
        PREVIEW_GEMINI_MODEL,
      );
      expect(result).toEqual([
        {
          functionResponse: {
            name: toolName,
            id: callId,
            response: {},
          },
        },
      ]);
    });

    it('should handle empty string llmContent', () => {
      const llmContent = '';
      const result = convertToFunctionResponse(
        toolName,
        callId,
        llmContent,
        PREVIEW_GEMINI_MODEL,
      );
      expect(result).toEqual([
        {
          functionResponse: {
            name: toolName,
            id: callId,
            response: { output: '' },
          },
        },
      ]);
    });

    it('should handle llmContent as an empty array', () => {
      const llmContent: PartListUnion = [];
      const result = convertToFunctionResponse(
        toolName,
        callId,
        llmContent,
        PREVIEW_GEMINI_MODEL,
      );
      expect(result).toEqual([
        {
          functionResponse: {
            name: toolName,
            id: callId,
            response: {},
          },
        },
      ]);
    });

    it('should handle llmContent as a Part with undefined inlineData/fileData/text', () => {
      const llmContent: Part = {}; // An empty part object
      const result = convertToFunctionResponse(
        toolName,
        callId,
        llmContent,
        PREVIEW_GEMINI_MODEL,
      );
      expect(result).toEqual([
        {
          functionResponse: {
            name: toolName,
            id: callId,
            response: {},
          },
        },
      ]);
    });
  });

  describe('getCitations', () => {
    it('should return empty array for no candidates', () => {
      expect(getCitations(minimalMockResponse(undefined))).toEqual([]);
    });

    it('should return empty array if no citationMetadata', () => {
      const response = mockResponse([mockTextPart('Hello')]);
      expect(getCitations(response)).toEqual([]);
    });

    it('should return citations with title and uri', () => {
      const citationMetadata: CitationMetadata = {
        citations: [
          {
            startIndex: 0,
            endIndex: 10,
            uri: 'https://example.com',
            title: 'Example Title',
          },
        ],
      };
      const response = mockResponse(
        [mockTextPart('Hello')],
        undefined,
        undefined,
        citationMetadata,
      );
      expect(getCitations(response)).toEqual([
        '(Example Title) https://example.com',
      ]);
    });

    it('should return citations with uri only if no title', () => {
      const citationMetadata: CitationMetadata = {
        citations: [
          {
            startIndex: 0,
            endIndex: 10,
            uri: 'https://example.com',
          },
        ],
      };
      const response = mockResponse(
        [mockTextPart('Hello')],
        undefined,
        undefined,
        citationMetadata,
      );
      expect(getCitations(response)).toEqual(['https://example.com']);
    });

    it('should filter out citations without uri', () => {
      const citationMetadata: CitationMetadata = {
        citations: [
          {
            startIndex: 0,
            endIndex: 10,
            title: 'No URI',
          },
          {
            startIndex: 10,
            endIndex: 20,
            uri: 'https://valid.com',
          },
        ],
      };
      const response = mockResponse(
        [mockTextPart('Hello')],
        undefined,
        undefined,
        citationMetadata,
      );
      expect(getCitations(response)).toEqual(['https://valid.com']);
    });
  });

  describe('getResponseTextFromParts', () => {
    it('should return undefined for no parts', () => {
      expect(getResponseTextFromParts([])).toBeUndefined();
    });
    it('should extract text from a single text part', () => {
      expect(getResponseTextFromParts([mockTextPart('Hello')])).toBe('Hello');
    });
    it('should concatenate text from multiple text parts', () => {
      expect(
        getResponseTextFromParts([
          mockTextPart('Hello '),
          mockTextPart('World'),
        ]),
      ).toBe('Hello World');
    });
    it('should ignore function call parts', () => {
      expect(
        getResponseTextFromParts([
          mockTextPart('Hello '),
          mockFunctionCallPart('testFunc'),
          mockTextPart('World'),
        ]),
      ).toBe('Hello World');
    });
    it('should return undefined if only function call parts exist', () => {
      expect(
        getResponseTextFromParts([
          mockFunctionCallPart('testFunc'),
          mockFunctionCallPart('anotherFunc'),
        ]),
      ).toBeUndefined();
    });
  });

  describe('getFunctionCalls', () => {
    it('should return undefined for no candidates', () => {
      expect(getFunctionCalls(minimalMockResponse(undefined))).toBeUndefined();
    });
    it('should return undefined for empty candidates array', () => {
      expect(getFunctionCalls(minimalMockResponse([]))).toBeUndefined();
    });
    it('should return undefined for no parts', () => {
      const response = mockResponse([]);
      expect(getFunctionCalls(response)).toBeUndefined();
    });
    it('should extract a single function call', () => {
      const func = { name: 'testFunc', args: { a: 1 } };
      const response = mockResponse([
        mockFunctionCallPart(func.name, func.args),
      ]);
      expect(getFunctionCalls(response)).toEqual([func]);
    });
    it('should extract multiple function calls', () => {
      const func1 = { name: 'testFunc1', args: { a: 1 } };
      const func2 = { name: 'testFunc2', args: { b: 2 } };
      const response = mockResponse([
        mockFunctionCallPart(func1.name, func1.args),
        mockFunctionCallPart(func2.name, func2.args),
      ]);
      expect(getFunctionCalls(response)).toEqual([func1, func2]);
    });
    it('should ignore text parts', () => {
      const func = { name: 'testFunc', args: { a: 1 } };
      const response = mockResponse([
        mockTextPart('Some text'),
        mockFunctionCallPart(func.name, func.args),
        mockTextPart('More text'),
      ]);
      expect(getFunctionCalls(response)).toEqual([func]);
    });
    it('should return undefined if only text parts exist', () => {
      const response = mockResponse([
        mockTextPart('Some text'),
        mockTextPart('More text'),
      ]);
      expect(getFunctionCalls(response)).toBeUndefined();
    });
  });

  describe('getFunctionCallsFromParts', () => {
    it('should return undefined for no parts', () => {
      expect(getFunctionCallsFromParts([])).toBeUndefined();
    });
    it('should extract a single function call', () => {
      const func = { name: 'testFunc', args: { a: 1 } };
      expect(
        getFunctionCallsFromParts([mockFunctionCallPart(func.name, func.args)]),
      ).toEqual([func]);
    });
    it('should extract multiple function calls', () => {
      const func1 = { name: 'testFunc1', args: { a: 1 } };
      const func2 = { name: 'testFunc2', args: { b: 2 } };
      expect(
        getFunctionCallsFromParts([
          mockFunctionCallPart(func1.name, func1.args),
          mockFunctionCallPart(func2.name, func2.args),
        ]),
      ).toEqual([func1, func2]);
    });
    it('should ignore text parts', () => {
      const func = { name: 'testFunc', args: { a: 1 } };
      expect(
        getFunctionCallsFromParts([
          mockTextPart('Some text'),
          mockFunctionCallPart(func.name, func.args),
          mockTextPart('More text'),
        ]),
      ).toEqual([func]);
    });
    it('should return undefined if only text parts exist', () => {
      expect(
        getFunctionCallsFromParts([
          mockTextPart('Some text'),
          mockTextPart('More text'),
        ]),
      ).toBeUndefined();
    });
  });

  describe('getFunctionCallsAsJson', () => {
    it('should return JSON string of function calls', () => {
      const func1 = { name: 'testFunc1', args: { a: 1 } };
      const func2 = { name: 'testFunc2', args: { b: 2 } };
      const response = mockResponse([
        mockFunctionCallPart(func1.name, func1.args),
        mockTextPart('text in between'),
        mockFunctionCallPart(func2.name, func2.args),
      ]);
      const expectedJson = JSON.stringify([func1, func2], null, 2);
      expect(getFunctionCallsAsJson(response)).toBe(expectedJson);
    });
    it('should return undefined if no function calls', () => {
      const response = mockResponse([mockTextPart('Hello')]);
      expect(getFunctionCallsAsJson(response)).toBeUndefined();
    });
  });

  describe('getFunctionCallsFromPartsAsJson', () => {
    it('should return JSON string of function calls from parts', () => {
      const func1 = { name: 'testFunc1', args: { a: 1 } };
      const func2 = { name: 'testFunc2', args: { b: 2 } };
      const parts = [
        mockFunctionCallPart(func1.name, func1.args),
        mockTextPart('text in between'),
        mockFunctionCallPart(func2.name, func2.args),
      ];
      const expectedJson = JSON.stringify([func1, func2], null, 2);
      expect(getFunctionCallsFromPartsAsJson(parts)).toBe(expectedJson);
    });
    it('should return undefined if no function calls in parts', () => {
      const parts = [mockTextPart('Hello')];
      expect(getFunctionCallsFromPartsAsJson(parts)).toBeUndefined();
    });
  });

  describe('getStructuredResponse', () => {
    it('should return only text if only text exists', () => {
      const response = mockResponse([mockTextPart('Hello World')]);
      expect(getStructuredResponse(response)).toBe('Hello World');
    });
    it('should return only function call JSON if only function calls exist', () => {
      const func = { name: 'testFunc', args: { data: 'payload' } };
      const response = mockResponse([
        mockFunctionCallPart(func.name, func.args),
      ]);
      const expectedJson = JSON.stringify([func], null, 2);
      expect(getStructuredResponse(response)).toBe(expectedJson);
    });
    it('should return text and function call JSON if both exist', () => {
      const text = 'Consider this data:';
      const func = { name: 'processData', args: { item: 42 } };
      const response = mockResponse([
        mockTextPart(text),
        mockFunctionCallPart(func.name, func.args),
      ]);
      const expectedJson = JSON.stringify([func], null, 2);
      expect(getStructuredResponse(response)).toBe(`${text}\n${expectedJson}`);
    });
    it('should return undefined if neither text nor function calls exist', () => {
      const response = mockResponse([]);
      expect(getStructuredResponse(response)).toBeUndefined();
    });
  });

  describe('getStructuredResponseFromParts', () => {
    it('should return only text if only text exists in parts', () => {
      const parts = [mockTextPart('Hello World')];
      expect(getStructuredResponseFromParts(parts)).toBe('Hello World');
    });
    it('should return only function call JSON if only function calls exist in parts', () => {
      const func = { name: 'testFunc', args: { data: 'payload' } };
      const parts = [mockFunctionCallPart(func.name, func.args)];
      const expectedJson = JSON.stringify([func], null, 2);
      expect(getStructuredResponseFromParts(parts)).toBe(expectedJson);
    });
    it('should return text and function call JSON if both exist in parts', () => {
      const text = 'Consider this data:';
      const func = { name: 'processData', args: { item: 42 } };
      const parts = [
        mockTextPart(text),
        mockFunctionCallPart(func.name, func.args),
      ];
      const expectedJson = JSON.stringify([func], null, 2);
      expect(getStructuredResponseFromParts(parts)).toBe(
        `${text}\n${expectedJson}`,
      );
    });
    it('should return undefined if neither text nor function calls exist in parts', () => {
      const parts: Part[] = [];
      expect(getStructuredResponseFromParts(parts)).toBeUndefined();
    });
  });
});
