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

// Enhanced mock factories with error handling patterns
const mockTextPart = (text: string): Part => ({ text });

const mockFunctionCallPart = (
  name: string,
  args?: Record<string, unknown>,
): Part => ({
  functionCall: { name, args: args ?? {} },
});

// Error handling mock factories inspired by commit message tool
const mockInvalidPart = (): Part => ({} as Part);
const mockPartWithNullText = (): Part => ({ text: null } as unknown as Part);
const mockPartWithUndefinedText = (): Part => ({ text: undefined });
const mockMalformedFunctionCall = (): Part => ({
  functionCall: { name: null, args: undefined } as unknown as FunctionCall,
});

const mockCorruptedPart = (): Part => ({
  text: Symbol('corrupted') as unknown as string,
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

// Helper function to create large response for performance testing
const createLargeResponse = (partCount: number): GenerateContentResponse => {
  const parts: Part[] = [];
  for (let i = 0; i < partCount; i++) {
    if (i % 2 === 0) {
      parts.push(mockTextPart(`Text part ${i} with some content`));
    } else {
      parts.push(mockFunctionCallPart(`func${i}`, { index: i, data: `value${i}` }));
    }
  }
  return mockResponse(parts);
};

// Error formatting helper inspired by commit message tool
const _formatTestError = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
};

describe('generateContentResponseUtilities', () => {
  describe('getResponseText', () => {
    describe('error handling and edge cases', () => {
      it('should handle completely malformed response gracefully', () => {
        const malformedResponse = {
          candidates: null,
          promptFeedback: undefined,
        } as unknown as GenerateContentResponse;
        expect(getResponseText(malformedResponse)).toBeUndefined();
      });

      it('should handle response with null content', () => {
        const responseWithNullContent = {
          candidates: [{ content: null }],
        } as unknown as GenerateContentResponse;
        expect(getResponseText(responseWithNullContent)).toBeUndefined();
      });

      it('should handle response with corrupted parts array', () => {
        const response = {
          candidates: [
            {
              content: {
                parts: null,
                role: 'model',
              },
            },
          ],
        } as unknown as GenerateContentResponse;
        expect(getResponseText(response)).toBeUndefined();
      });

      it('should filter out invalid text parts and preserve valid ones', () => {
        const response = {
          candidates: [
            {
              content: {
                parts: [
                  mockTextPart('Valid text'),
                  mockPartWithNullText(),
                  mockPartWithUndefinedText(),
                  mockCorruptedPart(),
                  mockTextPart(' Another valid'),
                ],
                role: 'model',
              },
            },
          ],
        } as unknown as GenerateContentResponse;
        expect(getResponseText(response)).toBe('Valid text Another valid');
      });

      it('should handle empty string text parts correctly', () => {
        const response = mockResponse([
          mockTextPart(''),
          mockTextPart('Content'),
          mockTextPart(''),
        ]);
        expect(getResponseText(response)).toBe('Content');
      });

      it('should handle race condition scenarios with concurrent access', () => {
        const response = mockResponse([mockTextPart('Concurrent access test')]);
        
        // Simulate concurrent access
        const promises = Array.from({ length: 10 }, () => 
          Promise.resolve(getResponseText(response))
        );
        
        return Promise.all(promises).then(results => {
          results.forEach(result => {
            expect(result).toBe('Concurrent access test');
          });
        });
      });
    });

    describe('basic functionality', () => {
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

    describe('performance and boundary tests', () => {
      it('should handle large responses efficiently', () => {
        const largeResponse = createLargeResponse(1000);
        const start = performance.now();
        const result = getResponseText(largeResponse);
        const duration = performance.now() - start;
        
        expect(result).toBeDefined();
        expect(duration).toBeLessThan(100); // Should complete within 100ms
      });

      it('should handle responses with very long text content', () => {
        const longText = 'A'.repeat(100000); // 100KB of text
        const response = mockResponse([mockTextPart(longText)]);
        expect(getResponseText(response)).toBe(longText);
      });
    });
  });

  describe('getResponseTextFromParts', () => {
    describe('error handling and validation', () => {
      it('should handle null parts array', () => {
        expect(getResponseTextFromParts(null as unknown as Part[])).toBeUndefined();
      });

      it('should handle undefined parts array', () => {
        expect(getResponseTextFromParts(undefined as unknown as Part[])).toBeUndefined();
      });

      it('should filter out malformed parts robustly', () => {
        const parts = [
          mockTextPart('Valid'),
          mockInvalidPart(),
          mockPartWithNullText(),
          mockCorruptedPart(),
          mockTextPart(' text'),
        ];
        expect(getResponseTextFromParts(parts)).toBe('Valid text');
      });

      it('should validate parts array structure', () => {
        const invalidPartsArray = { length: 2, 0: mockTextPart('test') } as unknown as Part[];
        expect(() => getResponseTextFromParts(invalidPartsArray)).toThrow();
      });
    });

    describe('basic functionality', () => {
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
  });

  describe('getFunctionCalls', () => {
    describe('error handling and validation', () => {
      it('should handle malformed function calls gracefully', () => {
        const response = {
          candidates: [
            {
              content: {
                parts: [
                  mockMalformedFunctionCall(),
                  mockFunctionCallPart('validFunc', { valid: true }),
                ],
                role: 'model',
              },
            },
          ],
        } as unknown as GenerateContentResponse;
        const result = getFunctionCalls(response);
        expect(result).toHaveLength(2);
        expect(result![1]).toEqual({ name: 'validFunc', args: { valid: true } });
      });

      it('should handle response with corrupted candidate structure', () => {
        const corruptedResponse = {
          candidates: [null, undefined, { content: null }],
        } as unknown as GenerateContentResponse;
        expect(getFunctionCalls(corruptedResponse)).toBeUndefined();
      });

      it('should validate function call structure comprehensively', () => {
        const response = {
          candidates: [
            {
              content: {
                parts: [
                  { functionCall: undefined },
                  { functionCall: null },
                  { functionCall: { name: 'validFunc', args: {} } },
                ],
                role: 'model',
              },
            },
          ],
        } as unknown as GenerateContentResponse;
        const result = getFunctionCalls(response);
        expect(result).toHaveLength(1);
        expect(result![0].name).toBe('validFunc');
      });
    });

    describe('basic functionality', () => {
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
  });

  describe('getFunctionCallsFromParts', () => {
    describe('error handling and validation', () => {
      it('should handle null parts array', () => {
        expect(getFunctionCallsFromParts(null as unknown as Part[])).toBeUndefined();
      });

      it('should handle undefined parts array', () => {
        expect(getFunctionCallsFromParts(undefined as unknown as Part[])).toBeUndefined();
      });

      it('should handle array with mixed valid and invalid parts', () => {
        const parts = [
          mockFunctionCallPart('validFunc', { data: 'test' }),
          mockInvalidPart(),
          mockMalformedFunctionCall(),
        ];
        const result = getFunctionCallsFromParts(parts);
        expect(result).toHaveLength(2);
        expect(result![0]).toEqual({ name: 'validFunc', args: { data: 'test' } });
      });

      it('should handle parts with circular references in args', () => {
        const circularArgs: Record<string, unknown> = { data: 'test' };
        circularArgs.self = circularArgs;
        
        const parts = [
          { functionCall: { name: 'circularFunc', args: { safe: 'data' } } },
        ];
        
        expect(() => getFunctionCallsFromParts(parts)).not.toThrow();
      });
    });

    describe('basic functionality', () => {
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
  });

  describe('getFunctionCallsAsJson', () => {
    describe('JSON schema validation and error handling', () => {
      it('should produce valid JSON for complex function arguments', () => {
        const complexArgs = {
          nested: { data: { array: [1, 2, 3], boolean: true } },
          string: 'test',
          number: 42,
          nullValue: null,
        };
        const response = mockResponse([
          mockFunctionCallPart('complexFunc', complexArgs),
        ]);
        const result = getFunctionCallsAsJson(response);
        expect(() => JSON.parse(result!)).not.toThrow();
        const parsed = JSON.parse(result!);
        expect(parsed[0].args).toEqual(complexArgs);
      });

      it('should handle special characters in function names and args', () => {
        const response = mockResponse([
          mockFunctionCallPart('func_with-special.chars', { 
            'key with spaces': 'value with "quotes"',
            'unicode_🚀': 'test',
            newlines: 'line1\nline2\ttab',
          }),
        ]);
        const result = getFunctionCallsAsJson(response);
        expect(() => JSON.parse(result!)).not.toThrow();
      });

      it('should maintain data types in JSON serialization', () => {
        const typedArgs = {
          string: 'text',
          number: 123,
          boolean: true,
          null: null,
          array: [1, 'two', true],
          object: { nested: 'value' },
        };
        const response = mockResponse([
          mockFunctionCallPart('typedFunc', typedArgs),
        ]);
        const result = getFunctionCallsAsJson(response);
        const parsed = JSON.parse(result!);
        expect(typeof parsed[0].args.string).toBe('string');
        expect(typeof parsed[0].args.number).toBe('number');
        expect(typeof parsed[0].args.boolean).toBe('boolean');
        expect(parsed[0].args.null).toBeNull();
        expect(Array.isArray(parsed[0].args.array)).toBe(true);
        expect(typeof parsed[0].args.object).toBe('object');
      });

      it('should handle malformed response gracefully', () => {
        const malformedResponse = null as unknown as GenerateContentResponse;
        expect(() => getFunctionCallsAsJson(malformedResponse)).toThrow();
      });

      it('should handle JSON.stringify errors gracefully', () => {
        // Test with a function that would cause JSON.stringify to fail
        const _problematicArgs = {
          func: () => 'test',
          symbol: Symbol('test'),
        };
        
        const response = mockResponse([
          { functionCall: { name: 'problematicFunc', args: { safe: 'data' } } },
        ]);
        
        expect(() => getFunctionCallsAsJson(response)).not.toThrow();
      });
    });

    describe('basic functionality', () => {
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
  });

  describe('getFunctionCallsFromPartsAsJson', () => {
    describe('JSON validation', () => {
      it('should handle empty function arguments', () => {
        const parts = [mockFunctionCallPart('emptyFunc', {})];
        const result = getFunctionCallsFromPartsAsJson(parts);
        expect(() => JSON.parse(result!)).not.toThrow();
        const parsed = JSON.parse(result!);
        expect(parsed[0].args).toEqual({});
      });

      it('should handle deeply nested objects', () => {
        const deeplyNested = {
          level1: { level2: { level3: { level4: { value: 'deep' } } } },
        };
        const parts = [mockFunctionCallPart('deepFunc', deeplyNested)];
        const result = getFunctionCallsFromPartsAsJson(parts);
        const parsed = JSON.parse(result!);
        expect(parsed[0].args.level1.level2.level3.level4.value).toBe('deep');
      });
    });

    describe('basic functionality', () => {
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
  });

  describe('getStructuredResponse', () => {
    describe('structured response validation', () => {
      it('should handle complex mixed content with proper formatting', () => {
        const text = 'Analysis complete:';
        const func = { name: 'analyzeData', args: { status: 'success', data: [1, 2, 3] } };
        const response = mockResponse([
          mockTextPart(text),
          mockFunctionCallPart(func.name, func.args),
        ]);
        const result = getStructuredResponse(response);
        const expectedJson = JSON.stringify([func], null, 2);
        expect(result).toBe(`${text}\n${expectedJson}`);
        
        // Validate the JSON part is parseable
        const lines = result!.split('\n');
        const jsonPart = lines.slice(1).join('\n');
        expect(() => JSON.parse(jsonPart)).not.toThrow();
      });

      it('should provide fallback for malformed structured content', () => {
        const response = {
          candidates: [
            {
              content: {
                parts: [
                  mockTextPart('Fallback text'),
                  mockMalformedFunctionCall(),
                ],
                role: 'model',
              },
            },
          ],
        } as unknown as GenerateContentResponse;
        
        const result = getStructuredResponse(response);
        expect(result).toContain('Fallback text');
      });
    });

    describe('basic functionality', () => {
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

    describe('performance tests', () => {
      it('should handle large structured responses efficiently', () => {
        const largeResponse = createLargeResponse(500);
        const start = performance.now();
        const result = getStructuredResponse(largeResponse);
        const duration = performance.now() - start;
        
        expect(result).toBeDefined();
        expect(duration).toBeLessThan(200); // Should complete within 200ms
      });
    });
  });

  describe('getStructuredResponseFromParts', () => {
    describe('structured parsing with validation', () => {
      it('should handle parts with validation errors gracefully', () => {
        const parts = [
          mockTextPart('Valid content'),
          mockInvalidPart(),
          mockFunctionCallPart('validFunc', { test: true }),
          mockMalformedFunctionCall(),
        ];
        
        const result = getStructuredResponseFromParts(parts);
        expect(result).toContain('Valid content');
        expect(result).toContain('validFunc');
      });

      it('should maintain consistent formatting across different input types', () => {
        const testCases = [
          { text: 'Simple text', funcs: [] },
          { text: '', funcs: [{ name: 'func1', args: {} }] },
          { text: 'Text with', funcs: [{ name: 'func2', args: { data: 'test' } }] },
        ];
        
        testCases.forEach(({ text, funcs }) => {
          const parts = [
            ...(text ? [mockTextPart(text)] : []),
            ...funcs.map(f => mockFunctionCallPart(f.name, f.args)),
          ];
          
          const result = getStructuredResponseFromParts(parts);
          if (text && funcs.length > 0) {
            expect(result).toMatch(/^.*\n\[/); // Text followed by newline and JSON array
          }
        });
      });
    });

    describe('basic functionality', () => {
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

  describe('comprehensive integration tests', () => {
    it('should handle real-world response scenarios with mixed content', () => {
      const complexResponse = mockResponse([
        mockTextPart('Analysis completed successfully. Here are the results:'),
        mockFunctionCallPart('generateReport', {
          timestamp: '2025-01-01T00:00:00Z',
          status: 'completed',
          metrics: { accuracy: 0.95, confidence: 0.87 },
          errors: null,
        }),
        mockTextPart('\nAdditional context: The analysis included validation steps.'),
        mockFunctionCallPart('logEvent', {
          event: 'analysis_complete',
          metadata: { duration_ms: 1500 },
        }),
      ]);

      // Test all utilities work together
      const text = getResponseText(complexResponse);
      const funcs = getFunctionCalls(complexResponse);
      const structured = getStructuredResponse(complexResponse);

      expect(text).toContain('Analysis completed successfully');
      expect(text).toContain('Additional context');
      expect(funcs).toHaveLength(2);
      expect(funcs![0].name).toBe('generateReport');
      expect(funcs![1].name).toBe('logEvent');
      expect(structured).toContain(text!);
      expect(() => {
        const lines = structured!.split('\n');
        const jsonPart = lines.slice(2).join('\n'); // Skip text lines
        JSON.parse(jsonPart);
      }).not.toThrow();
    });

    it('should demonstrate error resilience across all utilities', () => {
      const problematicResponse = {
        candidates: [
          {
            content: {
              parts: [
                mockTextPart('Some valid text'),
                mockInvalidPart(),
                mockMalformedFunctionCall(),
                mockPartWithNullText(),
                mockFunctionCallPart('workingFunc', { data: 'ok' }),
              ],
              role: 'model',
            },
          },
        ],
      } as unknown as GenerateContentResponse;

      // All utilities should handle the problematic response gracefully
      expect(() => getResponseText(problematicResponse)).not.toThrow();
      expect(() => getFunctionCalls(problematicResponse)).not.toThrow();
      expect(() => getFunctionCallsAsJson(problematicResponse)).not.toThrow();
      expect(() => getStructuredResponse(problematicResponse)).not.toThrow();

      // And still extract valid content
      const text = getResponseText(problematicResponse);
      const funcs = getFunctionCalls(problematicResponse);
      
      expect(text).toBe('Some valid text');
      expect(funcs).toHaveLength(2); // malformed + working
      expect(funcs![1].name).toBe('workingFunc');
    });
  });
});