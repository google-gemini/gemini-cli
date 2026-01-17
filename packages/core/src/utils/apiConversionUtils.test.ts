/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { convertToRestPayload } from './apiConversionUtils.js';
import type { GenerateContentParameters } from '@google/genai';
import {
  FunctionCallingConfigMode,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/genai';

describe('apiConversionUtils', () => {
  describe('convertToRestPayload', () => {
    it('handles minimal requests with no config', () => {
      const req: GenerateContentParameters = {
        model: 'gemini-3-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      const result = convertToRestPayload(req);

      expect(result).toStrictEqual({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      });
      expect(result['generationConfig']).toBeUndefined();
    });

    it('normalizes string systemInstruction to REST format', () => {
      const req: GenerateContentParameters = {
        model: 'gemini-3-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {
          systemInstruction: 'You are a helpful assistant.',
        },
      };

      const result = convertToRestPayload(req);

      expect(result['systemInstruction']).toStrictEqual({
        parts: [{ text: 'You are a helpful assistant.' }],
      });
      expect(result['generationConfig']).toBeUndefined();
    });

    it('preserves object-based systemInstruction', () => {
      const sysInstruction = { parts: [{ text: 'Object instruction' }] };
      const req: GenerateContentParameters = {
        model: 'gemini-3-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {
          systemInstruction: sysInstruction,
        },
      };

      const result = convertToRestPayload(req);

      expect(result['systemInstruction']).toStrictEqual(sysInstruction);
    });

    it('hoists capabilities (tools, safety, cachedContent) to the root level', () => {
      const req: GenerateContentParameters = {
        model: 'gemini-3-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {
          tools: [{ functionDeclarations: [{ name: 'myTool' }] }],
          toolConfig: {
            functionCallingConfig: { mode: FunctionCallingConfigMode.ANY },
          },
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
          ],
          cachedContent: 'cached-content-id',
        },
      };

      const result = convertToRestPayload(req);

      expect(result['tools']).toBeDefined();
      expect(result['toolConfig']).toBeDefined();
      expect(result['safetySettings']).toBeDefined();
      expect(result['cachedContent']).toBe('cached-content-id');
      // generationConfig should be omitted since no pure hyperparameters were passed
      expect(result['generationConfig']).toBeUndefined();
    });

    it('retains pure hyperparameters in generationConfig', () => {
      const req: GenerateContentParameters = {
        model: 'gemini-3-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 100,
        },
      };

      const result = convertToRestPayload(req);

      expect(result['generationConfig']).toStrictEqual({
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 100,
      });
    });

    it('strips JS-specific abortSignal from the final payload', () => {
      const req: GenerateContentParameters = {
        model: 'gemini-3-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {
          temperature: 0.5,
          abortSignal: new AbortController().signal,
        },
      };

      const result = convertToRestPayload(req);

      expect(result['generationConfig']).toStrictEqual({
        temperature: 0.5,
      });
      expect(result['abortSignal']).toBeUndefined();
      // @ts-expect-error Checking that the key doesn't exist inside generationConfig
      expect(result['generationConfig']?.abortSignal).toBeUndefined();
    });

    it('handles a complex kitchen-sink request correctly', () => {
      const req: GenerateContentParameters = {
        model: 'gemini-3-flash',
        contents: [{ role: 'user', parts: [{ text: 'Kitchen sink' }] }],
        config: {
          systemInstruction: 'Be witty.',
          temperature: 0.8,
          tools: [{ functionDeclarations: [{ name: 'test' }] }],
          abortSignal: new AbortController().signal,
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
            },
          ],
          topK: 40,
        },
      };

      const result = convertToRestPayload(req);

      // Root level checks
      expect(result['contents']).toBeDefined();
      expect(result['systemInstruction']).toStrictEqual({
        parts: [{ text: 'Be witty.' }],
      });
      expect(result['tools']).toStrictEqual([
        { functionDeclarations: [{ name: 'test' }] },
      ]);
      expect(result['safetySettings']).toStrictEqual([
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
        },
      ]);
      expect(result['abortSignal']).toBeUndefined();

      // Generation config checks
      expect(result['generationConfig']).toStrictEqual({
        temperature: 0.8,
        topK: 40,
      });
    });
  });
});
