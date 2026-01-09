/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fireBeforeModelHook,
  fireAfterModelHook,
} from './geminiChatHookTriggers.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';

// Mock dependencies
const mockRequest = vi.fn();
const mockMessageBus = {
  request: mockRequest,
} as unknown as MessageBus;

// Mock hook types
vi.mock('../hooks/types.js', async () => {
  const actual = await vi.importActual('../hooks/types.js');
  return {
    ...actual,
    createHookOutput: vi.fn(),
  };
});

import { createHookOutput } from '../hooks/types.js';

describe('Gemini Chat Hook Triggers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fireBeforeModelHook', () => {
    const llmRequest = {
      model: 'gemini-pro',
      contents: [{ parts: [{ text: 'test' }] }],
    } as GenerateContentParameters;

    it('should return stopped: true when hook requests stop execution', async () => {
      mockRequest.mockResolvedValue({
        output: { continue: false, stopReason: 'stopped by hook' },
      });
      vi.mocked(createHookOutput).mockReturnValue({
        shouldStopExecution: () => true,
        getEffectiveReason: () => 'stopped by hook',
        getBlockingError: () => ({ blocked: false, reason: '' }),
      } as unknown as ReturnType<typeof createHookOutput>);

      const result = await fireBeforeModelHook(mockMessageBus, llmRequest);

      expect(result).toEqual({
        blocked: true,
        stopped: true,
        reason: 'stopped by hook',
      });
    });

    it('should return blocked: true when hook blocks execution', async () => {
      mockRequest.mockResolvedValue({
        output: { decision: 'block', reason: 'blocked by hook' },
      });
      vi.mocked(createHookOutput).mockReturnValue({
        shouldStopExecution: () => false,
        getBlockingError: () => ({ blocked: true, reason: 'blocked by hook' }),
        getEffectiveReason: () => 'blocked by hook',
        getSyntheticResponse: () => undefined,
      } as unknown as ReturnType<typeof createHookOutput>);

      const result = await fireBeforeModelHook(mockMessageBus, llmRequest);

      expect(result).toEqual({
        blocked: true,
        reason: 'blocked by hook',
        syntheticResponse: undefined,
      });
    });

    it('should return modifications when hook allows execution', async () => {
      mockRequest.mockResolvedValue({
        output: { decision: 'allow' },
      });
      vi.mocked(createHookOutput).mockReturnValue({
        shouldStopExecution: () => false,
        getBlockingError: () => ({ blocked: false, reason: '' }),
        applyLLMRequestModifications: (req: GenerateContentParameters) => req,
      } as unknown as ReturnType<typeof createHookOutput>);

      const result = await fireBeforeModelHook(mockMessageBus, llmRequest);

      expect(result).toEqual({
        blocked: false,
        modifiedConfig: undefined,
        modifiedContents: llmRequest.contents,
      });
    });
  });

  describe('fireAfterModelHook', () => {
    const llmRequest = {
      model: 'gemini-pro',
      contents: [],
    } as GenerateContentParameters;
    const llmResponse = {
      candidates: [
        { content: { role: 'model', parts: [{ text: 'response' }] } },
      ],
    } as GenerateContentResponse;

    it('should return stopped: true when hook requests stop execution', async () => {
      mockRequest.mockResolvedValue({
        output: { continue: false, stopReason: 'stopped by hook' },
      });
      vi.mocked(createHookOutput).mockReturnValue({
        shouldStopExecution: () => true,
        getEffectiveReason: () => 'stopped by hook',
      } as unknown as ReturnType<typeof createHookOutput>);

      const result = await fireAfterModelHook(
        mockMessageBus,
        llmRequest,
        llmResponse,
      );

      expect(result).toEqual({
        response: llmResponse,
        stopped: true,
        reason: 'stopped by hook',
      });
    });

    it('should return blocked: true when hook blocks execution', async () => {
      mockRequest.mockResolvedValue({
        output: { decision: 'block', reason: 'blocked by hook' },
      });
      vi.mocked(createHookOutput).mockReturnValue({
        shouldStopExecution: () => false,
        getBlockingError: () => ({ blocked: true, reason: 'blocked by hook' }),
        getEffectiveReason: () => 'blocked by hook',
      } as unknown as ReturnType<typeof createHookOutput>);

      const result = await fireAfterModelHook(
        mockMessageBus,
        llmRequest,
        llmResponse,
      );

      expect(result).toEqual({
        response: llmResponse,
        blocked: true,
        reason: 'blocked by hook',
      });
    });

    it('should return modified response when hook modifies response', async () => {
      const modifiedResponse = { ...llmResponse, text: 'modified' };
      mockRequest.mockResolvedValue({
        output: { hookSpecificOutput: { llm_response: {} } },
      });
      vi.mocked(createHookOutput).mockReturnValue({
        shouldStopExecution: () => false,
        getBlockingError: () => ({ blocked: false, reason: '' }),
        getModifiedResponse: () => modifiedResponse,
      } as unknown as ReturnType<typeof createHookOutput>);

      const result = await fireAfterModelHook(
        mockMessageBus,
        llmRequest,
        llmResponse,
      );

      expect(result).toEqual({
        response: modifiedResponse,
      });
    });

    it('should return original response when hook has no effect', async () => {
      mockRequest.mockResolvedValue({
        output: {},
      });
      vi.mocked(createHookOutput).mockReturnValue({
        shouldStopExecution: () => false,
        getBlockingError: () => ({ blocked: false, reason: '' }),
        getModifiedResponse: () => undefined,
      } as unknown as ReturnType<typeof createHookOutput>);

      const result = await fireAfterModelHook(
        mockMessageBus,
        llmRequest,
        llmResponse,
      );

      expect(result).toEqual({
        response: llmResponse,
      });
    });
  });
});
