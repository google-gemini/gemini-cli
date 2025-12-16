/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createConversationOffered,
  formatProtoJsonDuration,
} from './telemetry.js';
import { ActionStatus, type StreamingLatency } from './types.js';
import { FinishReason, GenerateContentResponse } from '@google/genai';

describe('telemetry', () => {
  describe('createConversationOffered', () => {
    it('should create a ConversationOffered object with correct values', () => {
      const response = new GenerateContentResponse();
      response.candidates = [
        {
          index: 0,
          content: {
            role: 'model',
            parts: [{ text: 'response with ```code```' }],
          },
          citationMetadata: {
            citations: [
              { uri: 'https://example.com', startIndex: 0, endIndex: 10 },
            ],
          },
          finishReason: FinishReason.STOP,
        },
      ];
      response.sdkHttpResponse = {
        responseInternal: {
          ok: true,
        } as unknown as Response,
        json: async () => ({}),
      };
      const traceId = 'test-trace-id';
      const streamingLatency: StreamingLatency = { totalLatency: '1s' };

      const result = createConversationOffered(
        response,
        traceId,
        undefined,
        streamingLatency,
      );

      expect(result).toEqual({
        citationCount: '1',
        includedCode: true,
        status: ActionStatus.ACTION_STATUS_NO_ERROR,
        traceId,
        streamingLatency,
        isAgentic: true,
      });
    });

    it('should set status to CANCELLED if signal is aborted', () => {
      const response = new GenerateContentResponse();
      response.candidates = [];
      const signal = new AbortController().signal;
      vi.spyOn(signal, 'aborted', 'get').mockReturnValue(true);

      const result = createConversationOffered(
        response,
        'trace-id',
        signal,
        {},
      );

      expect(result.status).toBe(ActionStatus.ACTION_STATUS_CANCELLED);
    });

    it('should set status to ERROR_UNKNOWN if response has error (non-OK SDK response)', () => {
      const response = new GenerateContentResponse();
      response.sdkHttpResponse = {
        responseInternal: {
          ok: false,
        } as unknown as Response,
        json: async () => ({}),
      };

      const result = createConversationOffered(
        response,
        'trace-id',
        undefined,
        {},
      );

      expect(result.status).toBe(ActionStatus.ACTION_STATUS_ERROR_UNKNOWN);
    });

    it('should set status to ERROR_UNKNOWN if finishReason is not STOP or MAX_TOKENS', () => {
      const response = new GenerateContentResponse();
      response.candidates = [
        {
          index: 0,
          finishReason: FinishReason.SAFETY,
        },
      ];
      response.sdkHttpResponse = {
        responseInternal: {
          ok: true,
        } as unknown as Response,
        json: async () => ({}),
      };

      const result = createConversationOffered(
        response,
        'trace-id',
        undefined,
        {},
      );

      expect(result.status).toBe(ActionStatus.ACTION_STATUS_ERROR_UNKNOWN);
    });

    it('should set status to EMPTY if candidates is empty', () => {
      const response = new GenerateContentResponse();
      response.candidates = [];
      response.sdkHttpResponse = {
        responseInternal: {
          ok: true,
        } as unknown as Response,
        json: async () => ({}),
      };

      const result = createConversationOffered(
        response,
        'trace-id',
        undefined,
        {},
      );

      expect(result.status).toBe(ActionStatus.ACTION_STATUS_EMPTY);
    });

    it('should detect code in response', () => {
      const response = new GenerateContentResponse();
      response.candidates = [
        {
          index: 0,
          content: {
            parts: [
              { text: 'Here is some code:\n```js\nconsole.log("hi")\n```' },
            ],
          },
        },
      ];
      response.sdkHttpResponse = {
        responseInternal: {
          ok: true,
        } as unknown as Response,
        json: async () => ({}),
      };
      const result = createConversationOffered(response, 'id', undefined, {});
      expect(result.includedCode).toBe(true);
    });

    it('should not detect code if no backticks', () => {
      const response = new GenerateContentResponse();
      response.candidates = [
        {
          index: 0,
          content: {
            parts: [{ text: 'Here is some text.' }],
          },
        },
      ];
      response.sdkHttpResponse = {
        responseInternal: {
          ok: true,
        } as unknown as Response,
        json: async () => ({}),
      };
      const result = createConversationOffered(response, 'id', undefined, {});
      expect(result.includedCode).toBe(false);
    });
  });

  describe('formatProtoJsonDuration', () => {
    it('should format milliseconds to seconds string', () => {
      expect(formatProtoJsonDuration(1500)).toBe('1.5s');
      expect(formatProtoJsonDuration(100)).toBe('0.1s');
    });
  });
});
