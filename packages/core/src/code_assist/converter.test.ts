/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  toGenerateContentRequest,
  fromGenerateContentResponse,
  CaGenerateContentResponse,
} from './converter.js';
import {
  GenerateContentParameters,
  GenerateContentResponse,
  FinishReason,
  BlockedReason,
} from '@google/genai';

describe('converter', () => {
  describe('toCodeAssistRequest', () => {
    it('should convert a simple request with project', () => {
      const genaiReq: GenerateContentParameters = {
        model: 'gemini-pro',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };
      const codeAssistReq = toGenerateContentRequest(
        genaiReq,
        'my-prompt',
        'my-project',
        'my-session',
      );
      expect(codeAssistReq).toEqual({
        model: 'gemini-pro',
        project: 'my-project',
        request: {
          contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
          systemInstruction: undefined,
          cachedContent: undefined,
          tools: undefined,
          toolConfig: undefined,
          labels: undefined,
          safetySettings: undefined,
          generationConfig: undefined,
          session_id: 'my-session',
        },
        user_prompt_id: 'my-prompt',
      });
    });

    it('should convert a request without a project', () => {
      const genaiReq: GenerateContentParameters = {
        model: 'gemini-pro',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };
      const codeAssistReq = toGenerateContentRequest(
        genaiReq,
        'my-prompt',
        undefined,
        'my-session',
      );
      expect(codeAssistReq).toEqual({
        model: 'gemini-pro',
        project: undefined,
        request: {
          contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
          systemInstruction: undefined,
          cachedContent: undefined,
          tools: undefined,
          toolConfig: undefined,
          labels: undefined,
          safetySettings: undefined,
          generationConfig: undefined,
          session_id: 'my-session',
        },
        user_prompt_id: 'my-prompt',
      });
    });

    it('should convert a request with sessionId', () => {
      const genaiReq: GenerateContentParameters = {
        model: 'gemini-pro',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };
      const codeAssistReq = toGenerateContentRequest(
        genaiReq,
        'my-prompt',
        'my-project',
        'session-123',
      );
      expect(codeAssistReq).toEqual({
        model: 'gemini-pro',
        project: 'my-project',
        request: {
          contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
          systemInstruction: undefined,
          cachedContent: undefined,
          tools: undefined,
          toolConfig: undefined,
          labels: undefined,
          safetySettings: undefined,
          generationConfig: undefined,
          session_id: 'session-123',
        },
        user_prompt_id: 'my-prompt',
      });
    });

    it('should handle string content', () => {
      const genaiReq: GenerateContentParameters = {
        model: 'gemini-pro',
        contents: 'Hello',
      };
      const codeAssistReq = toGenerateContentRequest(
        genaiReq,
        'my-prompt',
        'my-project',
        'my-session',
      );
      expect(codeAssistReq.request.contents).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] },
      ]);
    });

    it('should handle Part[] content', () => {
      const genaiReq: GenerateContentParameters = {
        model: 'gemini-pro',
        contents: [{ text: 'Hello' }, { text: 'World' }],
      };
      const codeAssistReq = toGenerateContentRequest(
        genaiReq,
        'my-prompt',
        'my-project',
        'my-session',
      );
      expect(codeAssistReq.request.contents).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'user', parts: [{ text: 'World' }] },
      ]);
    });

    it('should handle system instructions', () => {
      const genaiReq: GenerateContentParameters = {
        model: 'gemini-pro',
        contents: 'Hello',
        config: {
          systemInstruction: 'You are a helpful assistant.',
        },
      };
      const codeAssistReq = toGenerateContentRequest(
        genaiReq,
        'my-prompt',
        'my-project',
        'my-session',
      );
      expect(codeAssistReq.request.systemInstruction).toEqual({
        role: 'user',
        parts: [{ text: 'You are a helpful assistant.' }],
      });
    });

    it('should handle generation config', () => {
      const genaiReq: GenerateContentParameters = {
        model: 'gemini-pro',
        contents: 'Hello',
        config: {
          temperature: 0.8,
          topK: 40,
        },
      };
      const codeAssistReq = toGenerateContentRequest(
        genaiReq,
        'my-prompt',
        'my-project',
        'my-session',
      );
      expect(codeAssistReq.request.generationConfig).toEqual({
        temperature: 0.8,
        topK: 40,
      });
    });

    it('should handle all generation config fields', () => {
      const genaiReq: GenerateContentParameters = {
        model: 'gemini-pro',
        contents: 'Hello',
        config: {
          temperature: 0.1,
          topP: 0.2,
          topK: 3,
          candidateCount: 4,
          maxOutputTokens: 5,
          stopSequences: ['a'],
          responseLogprobs: true,
          logprobs: 6,
          presencePenalty: 0.7,
          frequencyPenalty: 0.8,
          seed: 9,
          responseMimeType: 'application/json',
        },
      };
      const codeAssistReq = toGenerateContentRequest(
        genaiReq,
        'my-prompt',
        'my-project',
        'my-session',
      );
      expect(codeAssistReq.request.generationConfig).toEqual({
        temperature: 0.1,
        topP: 0.2,
        topK: 3,
        candidateCount: 4,
        maxOutputTokens: 5,
        stopSequences: ['a'],
        responseLogprobs: true,
        logprobs: 6,
        presencePenalty: 0.7,
        frequencyPenalty: 0.8,
        seed: 9,
        responseMimeType: 'application/json',
      });
    });
  });

  describe('fromCodeAssistResponse', () => {
    it('should convert a simple response', () => {
      const codeAssistRes: CaGenerateContentResponse = {
        response: {
          candidates: [
            {
              index: 0,
              content: {
                role: 'model',
                parts: [{ text: 'Hi there!' }],
              },
              finishReason: FinishReason.STOP,
              safetyRatings: [],
            },
          ],
        },
      };
      const genaiRes = fromGenerateContentResponse(codeAssistRes);
      expect(genaiRes).toBeInstanceOf(GenerateContentResponse);
      expect(genaiRes.candidates).toEqual(codeAssistRes.response.candidates);
    });

    it('should handle prompt feedback and usage metadata', () => {
      const codeAssistRes: CaGenerateContentResponse = {
        response: {
          candidates: [],
          promptFeedback: {
            blockReason: BlockedReason.SAFETY,
            safetyRatings: [],
          },
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            totalTokenCount: 30,
          },
        },
      };
      const genaiRes = fromGenerateContentResponse(codeAssistRes);
      expect(genaiRes.promptFeedback).toEqual(
        codeAssistRes.response.promptFeedback,
      );
      expect(genaiRes.usageMetadata).toEqual(
        codeAssistRes.response.usageMetadata,
      );
    });

    it('should handle automatic function calling history', () => {
      const codeAssistRes: CaGenerateContentResponse = {
        response: {
          candidates: [],
          automaticFunctionCallingHistory: [
            {
              role: 'model',
              parts: [
                {
                  functionCall: {
                    name: 'test_function',
                    args: {
                      foo: 'bar',
                    },
                  },
                },
              ],
            },
          ],
        },
      };
      const genaiRes = fromGenerateContentResponse(codeAssistRes);
      expect(genaiRes.automaticFunctionCallingHistory).toEqual(
        codeAssistRes.response.automaticFunctionCallingHistory,
      );
    });
  });
});
