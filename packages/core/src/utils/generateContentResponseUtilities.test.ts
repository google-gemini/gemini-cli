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
  FunctionCall,
} from '@google/genai';

// Mock factories
const mockTextPart = (text: string): Part => ({ text });
const mockFunctionCallPart = (name: string, args?: Record<string, unknown>): Part => ({
  functionCall: { name, args: args ?? {} },
});

const mockResponse = (parts: Part[], finishReason: FinishReason = FinishReason.STOP): GenerateContentResponse => ({
  candidates: [
    {
      content: { parts, role: 'model' },
      finishReason,
      safetyRatings: [],
    },
  ],
  text: '',
  data: undefined,
  functionCalls: [],
  executableCode: undefined,
  codeExecutionResult: undefined
});

describe('generateContentResponseUtilities', () => {
  describe('getResponseText', () => {
    it('should extract text from response', () => {
      const response = mockResponse([mockTextPart('Hello world')]);
      expect(getResponseText(response)).toBe('Hello world');
    });

    it('should join multiple text parts', () => {
      const response = mockResponse([
        mockTextPart('Hello '),
        mockTextPart('world'),
      ]);
      expect(getResponseText(response)).toBe('Hello world');
    });

    it('should return undefined for empty response', () => {
      const response = mockResponse([]);
      expect(getResponseText(response)).toBeUndefined();
    });

    it('should handle missing candidates', () => {
      const response: GenerateContentResponse = { 
        candidates: [],
        text: '',
        data: undefined,
        functionCalls: [],
        executableCode: undefined,
        codeExecutionResult: undefined
      };
      expect(getResponseText(response)).toBeUndefined();
    });
  });

  describe('getResponseTextFromParts', () => {
    it('should extract text from parts array', () => {
      const parts = [mockTextPart('Hello'), mockTextPart(' world')];
      expect(getResponseTextFromParts(parts)).toBe('Hello world');
    });

    it('should return undefined for empty parts', () => {
      expect(getResponseTextFromParts([])).toBeUndefined();
    });

    it('should filter out non-text parts', () => {
      const parts = [
        mockTextPart('Hello'),
        mockFunctionCallPart('test'),
        mockTextPart(' world'),
      ];
      expect(getResponseTextFromParts(parts)).toBe('Hello world');
    });
  });

  describe('getFunctionCalls', () => {
    it('should extract function calls from response', () => {
      const response = mockResponse([mockFunctionCallPart('testFunction', { arg: 'value' })]);
      const calls = getFunctionCalls(response);
      expect(calls).toHaveLength(1);
      expect(calls?.[0].name).toBe('testFunction');
      expect(calls?.[0].args).toEqual({ arg: 'value' });
    });

    it('should return undefined when no function calls', () => {
      const response = mockResponse([mockTextPart('Hello')]);
      expect(getFunctionCalls(response)).toBeUndefined();
    });

    it('should handle multiple function calls', () => {
      const response = mockResponse([
        mockFunctionCallPart('func1'),
        mockFunctionCallPart('func2', { test: true }),
      ]);
      const calls = getFunctionCalls(response);
      expect(calls).toHaveLength(2);
      expect(calls?.[0].name).toBe('func1');
      expect(calls?.[1].name).toBe('func2');
    });
  });

  describe('getFunctionCallsFromParts', () => {
    it('should extract function calls from parts', () => {
      const parts = [mockFunctionCallPart('testFunc', { data: 123 })];
      const calls = getFunctionCallsFromParts(parts);
      expect(calls).toHaveLength(1);
      expect(calls?.[0].name).toBe('testFunc');
    });

    it('should return undefined for empty parts', () => {
      expect(getFunctionCallsFromParts([])).toBeUndefined();
    });
  });

  describe('getFunctionCallsAsJson', () => {
    it('should serialize function calls to JSON', () => {
      const response = mockResponse([mockFunctionCallPart('test', { key: 'value' })]);
      const json = getFunctionCallsAsJson(response);
      expect(json).toContain('"name": "test"');
      expect(json).toContain('"key": "value"');
    });

    it('should return undefined when no function calls', () => {
      const response = mockResponse([mockTextPart('text')]);
      expect(getFunctionCallsAsJson(response)).toBeUndefined();
    });
  });

  describe('getFunctionCallsFromPartsAsJson', () => {
    it('should serialize function calls from parts to JSON', () => {
      const parts = [mockFunctionCallPart('test', { value: 42 })];
      const json = getFunctionCallsFromPartsAsJson(parts);
      expect(json).toContain('"name": "test"');
      expect(json).toContain('"value": 42');
    });
  });

  describe('getStructuredResponse', () => {
    it('should return text when no function calls', () => {
      const response = mockResponse([mockTextPart('Hello world')]);
      const result = getStructuredResponse(response);
      expect(result).toBe('Hello world');
    });

    it('should return function calls when present', () => {
      const response = mockResponse([mockFunctionCallPart('test', { arg: 1 })]);
      const result = getStructuredResponse(response);
      expect(result).toContain('"name": "test"');
      expect(result).toContain('"arg": 1');
    });

    it('should return both text and function calls', () => {
      const response = mockResponse([
        mockTextPart('Text content'),
        mockFunctionCallPart('func', { param: 'value' }),
      ]);
      const result = getStructuredResponse(response);
      expect(result).toContain('Text content');
      expect(result).toContain('"name": "func"');
    });

    it('should return undefined for empty response', () => {
      const response = mockResponse([]);
      expect(getStructuredResponse(response)).toBeUndefined();
    });
  });

  describe('getStructuredResponseFromParts', () => {
    it('should handle mixed content parts', () => {
      const parts = [
        mockTextPart('Start'),
        mockFunctionCallPart('action', { id: 1 }),
        mockTextPart('End'),
      ];
      const result = getStructuredResponseFromParts(parts);
      expect(result).toContain('StartEnd');
      expect(result).toContain('"name": "action"');
    });

    it('should return undefined for empty parts', () => {
      expect(getStructuredResponseFromParts([])).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should handle corrupted response gracefully', () => {
      const corruptedResponse = {
        candidates: undefined,
        text: '',
        data: undefined,
        functionCalls: [],
        executableCode: undefined,
        codeExecutionResult: undefined
      } as unknown as GenerateContentResponse;
      expect(getResponseText(corruptedResponse)).toBeUndefined();
      expect(getFunctionCalls(corruptedResponse)).toBeUndefined();
      expect(getStructuredResponse(corruptedResponse)).toBeUndefined();
    });

    it('should handle null text parts', () => {
      const parts = [{ text: null } as unknown as Part];
      expect(getResponseTextFromParts(parts)).toBeUndefined();
    });

    it('should handle malformed function calls', () => {
      const parts = [{ functionCall: null } as unknown as Part];
      expect(getFunctionCallsFromParts(parts)).toBeUndefined();
    });
  });
});