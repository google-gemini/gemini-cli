/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HookTranslatorGenAIv1,
  defaultHookTranslator,
  type LLMRequest,
  type LLMResponse,
  type HookToolConfig,
} from './hookTranslator.js';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
  ToolConfig,
  ContentListUnion,
} from '@google/genai';

describe('HookTranslator', () => {
  let translator: HookTranslatorGenAIv1;

  beforeEach(() => {
    translator = new HookTranslatorGenAIv1();
  });

  describe('defaultHookTranslator', () => {
    it('should be an instance of HookTranslatorGenAIv1', () => {
      expect(defaultHookTranslator).toBeInstanceOf(HookTranslatorGenAIv1);
    });
  });

  describe('LLM Request Translation', () => {
    it('should convert SDK request to hook format', () => {
      const sdkRequest: GenerateContentParameters = {
        model: 'gemini-1.5-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello world' }],
          },
        ],
        config: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
      } as unknown as GenerateContentParameters;

      const hookRequest = translator.toHookLLMRequest(sdkRequest);

      expect(hookRequest).toEqual({
        model: 'gemini-1.5-flash',
        messages: [
          {
            role: 'user',
            content: 'Hello world',
          },
        ],
        config: {
          temperature: 0.7,
          maxOutputTokens: 1000,
          topP: undefined,
          topK: undefined,
        },
      });
    });

    it('should handle string contents', () => {
      const sdkRequest: GenerateContentParameters = {
        model: 'gemini-1.5-flash',
        contents: ['Simple string message'],
      } as unknown as GenerateContentParameters;

      const hookRequest = translator.toHookLLMRequest(sdkRequest);

      expect(hookRequest.messages).toEqual([
        {
          role: 'user',
          content: 'Simple string message',
        },
      ]);
    });

    it('should handle conversion errors gracefully', () => {
      const sdkRequest: GenerateContentParameters = {
        model: 'gemini-1.5-flash',
        contents: [null as unknown as ContentListUnion], // Invalid content
      } as unknown as GenerateContentParameters;

      const hookRequest = translator.toHookLLMRequest(sdkRequest);

      // When contents are invalid, the translator skips them and returns empty messages
      expect(hookRequest.messages).toEqual([]);
      expect(hookRequest.model).toBe('gemini-1.5-flash');
    });

    it('should convert hook request back to SDK format', () => {
      const hookRequest: LLMRequest = {
        model: 'gemini-1.5-flash',
        messages: [
          {
            role: 'user',
            content: 'Hello world',
          },
        ],
        config: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
      };

      const sdkRequest = translator.fromHookLLMRequest(hookRequest);

      expect(sdkRequest.model).toBe('gemini-1.5-flash');
      expect(sdkRequest.contents).toEqual([
        {
          role: 'user',
          parts: [{ text: 'Hello world' }],
        },
      ]);
    });

    it('should apply model override when hook returns only model field', () => {
      const baseRequest: GenerateContentParameters = {
        model: 'gemini-2.5-flash-lite',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }],
          },
        ],
      } as unknown as GenerateContentParameters;

      // Simulate a hook that only overrides the model — no messages field
      const hookRequest = {
        model: 'gemini-2.5-flash',
      } as unknown as LLMRequest;

      const sdkRequest = translator.fromHookLLMRequest(
        hookRequest,
        baseRequest,
      );

      // Model should be overridden
      expect(sdkRequest.model).toBe('gemini-2.5-flash');
      // Original conversation contents should be preserved
      expect(sdkRequest.contents).toEqual(baseRequest.contents);
    });

    it('should preserve base request contents when hook messages is undefined', () => {
      const baseRequest: GenerateContentParameters = {
        model: 'gemini-1.5-flash',
        contents: [
          { role: 'user', parts: [{ text: 'original message' }] },
          { role: 'model', parts: [{ text: 'original reply' }] },
        ],
      } as unknown as GenerateContentParameters;

      const hookRequest = {
        model: 'gemini-1.5-pro',
        // messages intentionally omitted
      } as unknown as LLMRequest;

      const sdkRequest = translator.fromHookLLMRequest(
        hookRequest,
        baseRequest,
      );

      expect(sdkRequest.model).toBe('gemini-1.5-pro');
      expect(sdkRequest.contents).toEqual(baseRequest.contents);
    });
  });

  // Regression tests for https://github.com/google-gemini/gemini-cli/issues/25558
  // BeforeModel hooks that modify text in conversations containing tool calls
  // were destroying functionCall/functionResponse parts because
  // fromHookLLMRequest rebuilt contents text-only. The fix merges hook text
  // edits back into baseRequest.contents in place, preserving non-text parts.
  describe('fromHookLLMRequest with baseRequest (non-text part preservation)', () => {
    it('should preserve functionCall parts when merging hook text back', () => {
      const baseRequest = {
        model: 'gemini-2.0-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }],
          },
          {
            role: 'model',
            parts: [
              { text: 'Let me check that.' },
              { functionCall: { name: 'search', args: { q: 'test' } } },
            ],
          },
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: 'search',
                  response: { results: [] },
                },
              },
            ],
          },
          {
            role: 'model',
            parts: [{ text: 'No results found.' }],
          },
        ],
      } as unknown as GenerateContentParameters;

      const hookRequest: LLMRequest = {
        model: 'gemini-2.0-flash',
        messages: [
          { role: 'user', content: 'Hello [MODIFIED]' },
          { role: 'model', content: 'Let me check that.' },
          // contents[2] (functionResponse only) was skipped by toHookLLMRequest
          { role: 'model', content: 'No results found.' },
        ],
      };

      const result = translator.fromHookLLMRequest(hookRequest, baseRequest);
      const contents = result.contents as Array<{
        role: string;
        parts: Array<Record<string, unknown>>;
      }>;

      expect(contents).toHaveLength(4);

      // First content: text updated
      expect(contents[0].parts[0]['text']).toBe('Hello [MODIFIED]');

      // Second content: text updated AND functionCall preserved
      expect(contents[1].parts).toHaveLength(2);
      expect(contents[1].parts[0]['text']).toBe('Let me check that.');
      expect(contents[1].parts[1]['functionCall']).toBeDefined();

      // Third content: functionResponse preserved as-is (was skipped)
      expect(contents[2].parts[0]['functionResponse']).toBeDefined();
      expect(contents[2].parts).toHaveLength(1);

      // Fourth content: text updated
      expect(contents[3].parts[0]['text']).toBe('No results found.');
    });

    it('should handle text-only entries interleaved with function-only entries', () => {
      const baseRequest = {
        model: 'gemini-2.0-flash',
        contents: [
          { role: 'user', parts: [{ text: 'Q1' }] },
          {
            role: 'model',
            parts: [{ functionCall: { name: 'tool1', args: {} } }],
          },
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: 'tool1',
                  response: { ok: true },
                },
              },
            ],
          },
          { role: 'model', parts: [{ text: 'Answer' }] },
        ],
      } as unknown as GenerateContentParameters;

      const hookRequest: LLMRequest = {
        model: 'gemini-2.0-flash',
        messages: [
          { role: 'user', content: 'Q1-modified' },
          // contents[1] and [2] skipped (no text)
          { role: 'model', content: 'Answer-modified' },
        ],
      };

      const result = translator.fromHookLLMRequest(hookRequest, baseRequest);
      const contents = result.contents as Array<{
        role: string;
        parts: Array<Record<string, unknown>>;
      }>;

      expect(contents).toHaveLength(4);
      expect(contents[0].parts[0]['text']).toBe('Q1-modified');
      expect(contents[1].parts[0]['functionCall']).toBeDefined();
      expect(contents[2].parts[0]['functionResponse']).toBeDefined();
      expect(contents[3].parts[0]['text']).toBe('Answer-modified');
    });

    it('should collapse multiple text parts and preserve non-text parts', () => {
      const baseRequest = {
        model: 'gemini-2.0-flash',
        contents: [
          {
            role: 'model',
            parts: [
              { text: 'I will search' },
              { text: ' for you.' },
              { functionCall: { name: 'search', args: {} } },
            ],
          },
        ],
      } as unknown as GenerateContentParameters;

      const hookRequest: LLMRequest = {
        model: 'gemini-2.0-flash',
        messages: [
          { role: 'model', content: 'I will search for you. [BLINDED]' },
        ],
      };

      const result = translator.fromHookLLMRequest(hookRequest, baseRequest);
      const contents = result.contents as Array<{
        role: string;
        parts: Array<Record<string, unknown>>;
      }>;

      expect(contents).toHaveLength(1);
      const parts = contents[0].parts;
      // Multiple text parts collapsed to one, non-text preserved
      expect(parts[0]['text']).toBe('I will search for you. [BLINDED]');
      expect(parts[1]['functionCall']).toBeDefined();
      expect(parts).toHaveLength(2);
    });

    it('should fall back to text-only when baseRequest is undefined', () => {
      const hookRequest: LLMRequest = {
        model: 'gemini-2.0-flash',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const result = translator.fromHookLLMRequest(hookRequest);

      expect(result.contents).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] },
      ]);
    });

    it('should fall back to text-only when baseRequest has no contents', () => {
      const hookRequest: LLMRequest = {
        model: 'gemini-2.0-flash',
        messages: [{ role: 'user', content: 'Hello' }],
      };
      const baseRequest = {
        model: 'gemini-2.0-flash',
      } as GenerateContentParameters;

      const result = translator.fromHookLLMRequest(hookRequest, baseRequest);

      expect(result.contents).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] },
      ]);
    });

    it('should append extra hook messages beyond base contents', () => {
      const baseRequest = {
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      } as unknown as GenerateContentParameters;

      const hookRequest: LLMRequest = {
        model: 'gemini-2.0-flash',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'model', content: 'Extra message added by hook' },
        ],
      };

      const result = translator.fromHookLLMRequest(hookRequest, baseRequest);
      const contents = result.contents as Array<{
        role: string;
        parts: Array<Record<string, unknown>>;
      }>;

      expect(contents).toHaveLength(2);
      expect(contents[1].parts[0]['text']).toBe('Extra message added by hook');
    });
  });

  describe('LLM Response Translation', () => {
    it('should convert SDK response to hook format', () => {
      const sdkResponse: GenerateContentResponse = {
        text: 'Hello response',
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Hello response' }],
            },
            finishReason: 'STOP',
            index: 0,
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      } as unknown as GenerateContentResponse;

      const hookResponse = translator.toHookLLMResponse(sdkResponse);

      expect(hookResponse).toEqual({
        text: 'Hello response',
        candidates: [
          {
            content: {
              role: 'model',
              parts: ['Hello response'],
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: undefined,
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      });
    });

    it('should convert hook response back to SDK format', () => {
      const hookResponse: LLMResponse = {
        text: 'Hello response',
        candidates: [
          {
            content: {
              role: 'model',
              parts: ['Hello response'],
            },
            finishReason: 'STOP',
          },
        ],
      };

      const sdkResponse = translator.fromHookLLMResponse(hookResponse);

      expect(sdkResponse.text).toBe('Hello response');
      expect(sdkResponse.candidates).toHaveLength(1);
      expect(sdkResponse.candidates?.[0]?.content?.parts?.[0]?.text).toBe(
        'Hello response',
      );
    });
  });

  describe('Tool Config Translation', () => {
    it('should convert SDK tool config to hook format', () => {
      const sdkToolConfig = {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: ['tool1', 'tool2'],
        },
      } as unknown as ToolConfig;

      const hookToolConfig = translator.toHookToolConfig(sdkToolConfig);

      expect(hookToolConfig).toEqual({
        mode: 'ANY',
        allowedFunctionNames: ['tool1', 'tool2'],
      });
    });

    it('should convert hook tool config back to SDK format', () => {
      const hookToolConfig: HookToolConfig = {
        mode: 'AUTO',
        allowedFunctionNames: ['tool1', 'tool2'],
      };

      const sdkToolConfig = translator.fromHookToolConfig(hookToolConfig);

      expect(sdkToolConfig.functionCallingConfig).toEqual({
        mode: 'AUTO',
        allowedFunctionNames: ['tool1', 'tool2'],
      });
    });

    it('should handle undefined tool config', () => {
      const sdkToolConfig = {} as ToolConfig;

      const hookToolConfig = translator.toHookToolConfig(sdkToolConfig);

      expect(hookToolConfig).toEqual({
        mode: undefined,
        allowedFunctionNames: undefined,
      });
    });
  });
});
