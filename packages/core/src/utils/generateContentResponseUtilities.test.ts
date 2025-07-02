/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  getResponseText,
  getResponseTextFromParts,
  getFunctionCalls,
  getFunctionCallsFromParts,
  getFunctionCallsAsJson,
  getFunctionCallsFromPartsAsJson,
  getStructuredResponse,
  getStructuredResponseFromParts,
} from './generateContentResponseUtilities.js';
import {
  GenerateContentResponse,
  Part,
  FinishReason,
  SafetyRating,
} from '@google/genai';

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
  describe('getResponseText', () => {
    it('should return undefined for no candidates', () => {
      expect(getResponseText(minimalMockResponse(undefined))).toBeUndefined();
    });
    it('should return undefined for empty candidates array', () => {
      expect(getResponseText(minimalMockResponse([]))).toBeUndefined();
    });
    it('should return undefined for no parts', () => {
      const response = mockResponse([]);
      expect(getResponseText(response)).toBeUndefined();
    });
    it('should extract text from a single text part', () => {
      const response = mockResponse([mockTextPart('Hello')]);
      expect(getResponseText(response)).toBe('Hello');
    });
    it('should concatenate text from multiple text parts', () => {
      const response = mockResponse([
        mockTextPart('Hello '),
        mockTextPart('World'),
      ]);
      expect(getResponseText(response)).toBe('Hello World');
    });
    it('should ignore function call parts', () => {
      const response = mockResponse([
        mockTextPart('Hello '),
        mockFunctionCallPart('testFunc'),
        mockTextPart('World'),
      ]);
      expect(getResponseText(response)).toBe('Hello World');
    });
    it('should return undefined if only function call parts exist', () => {
      const response = mockResponse([
        mockFunctionCallPart('testFunc'),
        mockFunctionCallPart('anotherFunc'),
      ]);
      expect(getResponseText(response)).toBeUndefined();
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
