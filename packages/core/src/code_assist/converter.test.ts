/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { CaGenerateContentResponse } from './converter.js';
import {
  toGenerateContentRequest,
  fromGenerateContentResponse,
  toContents,
} from './converter.js';
import type {
  ContentListUnion,
  GenerateContentParameters,
} from '@google/genai';
import {
  GenerateContentResponse,
  FinishReason,
  BlockedReason,
  type Part,
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

  describe('toContents', () => {
    it('should handle Content', () => {
      const content: ContentListUnion = {
        role: 'user',
        parts: [{ text: 'hello' }],
      };
      expect(toContents(content)).toEqual([
        { role: 'user', parts: [{ text: 'hello' }] },
      ]);
    });

    it('should handle array of Contents', () => {
      const contents: ContentListUnion = [
        { role: 'user', parts: [{ text: 'hello' }] },
        { role: 'model', parts: [{ text: 'hi' }] },
      ];
      expect(toContents(contents)).toEqual([
        { role: 'user', parts: [{ text: 'hello' }] },
        { role: 'model', parts: [{ text: 'hi' }] },
      ]);
    });

    it('should handle Part', () => {
      const part: ContentListUnion = { text: 'a part' };
      expect(toContents(part)).toEqual([
        { role: 'user', parts: [{ text: 'a part' }] },
      ]);
    });

    it('should handle array of Parts', () => {
      const parts = [{ text: 'part 1' }, 'part 2'];
      expect(toContents(parts)).toEqual([
        { role: 'user', parts: [{ text: 'part 1' }] },
        { role: 'user', parts: [{ text: 'part 2' }] },
      ]);
    });

    it('should handle string', () => {
      const str: ContentListUnion = 'a string';
      expect(toContents(str)).toEqual([
        { role: 'user', parts: [{ text: 'a string' }] },
      ]);
    });

    it('should handle array of strings', () => {
      const strings: ContentListUnion = ['string 1', 'string 2'];
      expect(toContents(strings)).toEqual([
        { role: 'user', parts: [{ text: 'string 1' }] },
        { role: 'user', parts: [{ text: 'string 2' }] },
      ]);
    });

    it('should convert thought parts to text parts for API compatibility', () => {
      const contentWithThought: ContentListUnion = {
        role: 'model',
        parts: [
          { text: 'regular text' },
          { thought: 'thinking about the problem' } as Part & {
            thought: string;
          },
          { text: 'more text' },
        ],
      };
      expect(toContents(contentWithThought)).toEqual([
        {
          role: 'model',
          parts: [
            { text: 'regular text' },
            { text: '[Thought: thinking about the problem]' },
            { text: 'more text' },
          ],
        },
      ]);
    });

    it('should combine text and thought for text parts with thoughts', () => {
      const contentWithTextAndThought: ContentListUnion = {
        role: 'model',
        parts: [
          {
            text: 'Here is my response',
            thought: 'I need to be careful here',
          } as Part & { thought: string },
        ],
      };
      expect(toContents(contentWithTextAndThought)).toEqual([
        {
          role: 'model',
          parts: [
            {
              text: 'Here is my response\n[Thought: I need to be careful here]',
            },
          ],
        },
      ]);
    });

    it('should preserve non-thought properties while removing thought', () => {
      const contentWithComplexPart: ContentListUnion = {
        role: 'model',
        parts: [
          {
            functionCall: { name: 'calculate', args: { x: 5, y: 10 } },
            thought: 'Performing calculation',
          } as Part & { thought: string },
        ],
      };
      expect(toContents(contentWithComplexPart)).toEqual([
        {
          role: 'model',
          parts: [
            {
              functionCall: { name: 'calculate', args: { x: 5, y: 10 } },
            },
          ],
        },
      ]);
    });

    it('should convert invalid text content to valid text part with thought', () => {
      const contentWithInvalidText: ContentListUnion = {
        role: 'model',
        parts: [
          {
            text: 123, // Invalid - should be string
            thought: 'Processing number',
          } as Part & { thought: string; text: number },
        ],
      };
      expect(toContents(contentWithInvalidText)).toEqual([
        {
          role: 'model',
          parts: [
            {
              text: '123\n[Thought: Processing number]',
            },
          ],
        },
      ]);
    });
  });
});
