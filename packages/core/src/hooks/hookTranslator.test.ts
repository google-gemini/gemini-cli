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
