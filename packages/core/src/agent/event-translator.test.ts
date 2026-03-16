/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  translateEvent,
  createTranslationState,
  mapFinishReason,
  mapHttpToGrpcStatus,
  mapError,
  mapUsage,
  type TranslationState,
} from './event-translator.js';
import { GeminiEventType } from '../core/turn.js';
import type { ServerGeminiStreamEvent } from '../core/turn.js';
import { FinishReason } from '@google/genai';
import type { AgentEvent } from './types.js';

describe('event-translator', () => {
  let state: TranslationState;

  beforeEach(() => {
    state = createTranslationState('test-stream-id');
  });

  // -----------------------------------------------------------------------
  // createTranslationState
  // -----------------------------------------------------------------------

  describe('createTranslationState', () => {
    it('creates state with provided streamId', () => {
      const s = createTranslationState('my-id');
      expect(s.streamId).toBe('my-id');
      expect(s.streamStartEmitted).toBe(false);
      expect(s.model).toBeUndefined();
      expect(s.eventCounter).toBe(0);
    });

    it('generates a random streamId when none is provided', () => {
      const s = createTranslationState();
      expect(s.streamId).toBeTruthy();
      expect(s.streamId).not.toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // ModelInfo
  // -----------------------------------------------------------------------

  describe('ModelInfo', () => {
    it('emits stream_start on first ModelInfo', () => {
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ModelInfo,
        value: 'gemini-2.5-pro',
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('stream_start');
      expect((result[0] as AgentEvent<'stream_start'>).streamId).toBe(
        'test-stream-id',
      );
      expect(state.model).toBe('gemini-2.5-pro');
      expect(state.streamStartEmitted).toBe(true);
    });

    it('emits session_update on subsequent ModelInfo', () => {
      // First ModelInfo — stream_start
      translateEvent(
        { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
        state,
      );

      // Second ModelInfo — session_update
      const result = translateEvent(
        { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-flash' },
        state,
      );
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('session_update');
      expect((result[0] as AgentEvent<'session_update'>).model).toBe(
        'gemini-2.5-flash',
      );
      expect(state.model).toBe('gemini-2.5-flash');
    });
  });

  // -----------------------------------------------------------------------
  // Content
  // -----------------------------------------------------------------------

  describe('Content', () => {
    it('emits message with text content', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Content,
        value: 'Hello, world!',
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const msg = result[0] as AgentEvent<'message'>;
      expect(msg.type).toBe('message');
      expect(msg.role).toBe('agent');
      expect(msg.content).toEqual([{ type: 'text', text: 'Hello, world!' }]);
    });

    it('auto-emits stream_start if not yet emitted', () => {
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Content,
        value: 'Hello!',
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('stream_start');
      expect(result[1].type).toBe('message');
    });
  });

  // -----------------------------------------------------------------------
  // Thought
  // -----------------------------------------------------------------------

  describe('Thought', () => {
    it('emits message with thought content', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Thought,
        value: {
          subject: 'Planning',
          description: 'Let me think about this...',
        },
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const msg = result[0] as AgentEvent<'message'>;
      expect(msg.type).toBe('message');
      expect(msg.role).toBe('agent');
      expect(msg.content).toEqual([
        { type: 'thought', thought: 'Let me think about this...' },
      ]);
      expect(msg._meta?.['subject']).toBe('Planning');
    });

    it('omits subject from _meta when empty', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Thought,
        value: { subject: '', description: 'Thinking...' },
      };

      const result = translateEvent(event, state);
      const msg = result[0] as AgentEvent<'message'>;
      expect(msg._meta?.['subject']).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Citation
  // -----------------------------------------------------------------------

  describe('Citation', () => {
    it('emits message with citation meta', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Citation,
        value: 'Citations:\nhttps://example.com',
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const msg = result[0] as AgentEvent<'message'>;
      expect(msg.type).toBe('message');
      expect(msg.content).toEqual([
        { type: 'text', text: 'Citations:\nhttps://example.com' },
      ]);
      expect(msg._meta?.['citation']).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Finished
  // -----------------------------------------------------------------------

  describe('Finished', () => {
    it('emits usage + stream_end for STOP', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Finished,
        value: {
          reason: FinishReason.STOP,
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 50,
            cachedContentTokenCount: 10,
          },
        },
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(2);

      const usage = result[0] as AgentEvent<'usage'>;
      expect(usage.type).toBe('usage');
      expect(usage.inputTokens).toBe(100);
      expect(usage.outputTokens).toBe(50);
      expect(usage.cachedTokens).toBe(10);

      const end = result[1] as AgentEvent<'stream_end'>;
      expect(end.type).toBe('stream_end');
      expect(end.reason).toBe('completed');
    });

    it('emits only stream_end when no usageMetadata', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Finished,
        value: {
          reason: FinishReason.STOP,
          usageMetadata: undefined,
        },
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('stream_end');
    });

    it('maps undefined finish reason to completed', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Finished,
        value: {
          reason: undefined,
          usageMetadata: undefined,
        },
      };

      const result = translateEvent(event, state);
      expect((result[0] as AgentEvent<'stream_end'>).reason).toBe('completed');
    });
  });

  // -----------------------------------------------------------------------
  // Error
  // -----------------------------------------------------------------------

  describe('Error', () => {
    it('emits error event from StructuredError', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Error,
        value: {
          error: { message: 'Rate limit exceeded', status: 429 },
        },
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const err = result[0] as AgentEvent<'error'>;
      expect(err.type).toBe('error');
      expect(err.status).toBe('RESOURCE_EXHAUSTED');
      expect(err.message).toBe('Rate limit exceeded');
      expect(err.fatal).toBe(true);
    });

    it('emits error with INTERNAL status when no HTTP status', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Error,
        value: {
          error: { message: 'Something broke' },
        },
      };

      const result = translateEvent(event, state);
      const err = result[0] as AgentEvent<'error'>;
      expect(err.status).toBe('INTERNAL');
    });
  });

  // -----------------------------------------------------------------------
  // UserCancelled
  // -----------------------------------------------------------------------

  describe('UserCancelled', () => {
    it('emits stream_end with aborted reason', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.UserCancelled,
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const end = result[0] as AgentEvent<'stream_end'>;
      expect(end.reason).toBe('aborted');
    });
  });

  // -----------------------------------------------------------------------
  // MaxSessionTurns
  // -----------------------------------------------------------------------

  describe('MaxSessionTurns', () => {
    it('emits stream_end with max_turns reason', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.MaxSessionTurns,
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const end = result[0] as AgentEvent<'stream_end'>;
      expect(end.reason).toBe('max_turns');
    });
  });

  // -----------------------------------------------------------------------
  // LoopDetected
  // -----------------------------------------------------------------------

  describe('LoopDetected', () => {
    it('emits error + stream_end with failed reason', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.LoopDetected,
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('error');
      expect((result[0] as AgentEvent<'error'>).status).toBe('INTERNAL');
      expect(result[1].type).toBe('stream_end');
      expect((result[1] as AgentEvent<'stream_end'>).reason).toBe('failed');
    });
  });

  // -----------------------------------------------------------------------
  // ContextWindowWillOverflow
  // -----------------------------------------------------------------------

  describe('ContextWindowWillOverflow', () => {
    it('emits error with RESOURCE_EXHAUSTED', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ContextWindowWillOverflow,
        value: {
          estimatedRequestTokenCount: 100000,
          remainingTokenCount: 50000,
        },
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const err = result[0] as AgentEvent<'error'>;
      expect(err.status).toBe('RESOURCE_EXHAUSTED');
      expect(err.fatal).toBe(true);
      expect(err.message).toContain('100000');
      expect(err.message).toContain('50000');
    });
  });

  // -----------------------------------------------------------------------
  // AgentExecutionStopped
  // -----------------------------------------------------------------------

  describe('AgentExecutionStopped', () => {
    it('emits message (if systemMessage) + stream_end completed', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.AgentExecutionStopped,
        value: {
          reason: 'Hook stopped execution',
          systemMessage: 'Agent was stopped by policy.',
        },
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(2);
      const msg = result[0] as AgentEvent<'message'>;
      expect(msg.type).toBe('message');
      expect(msg.content[0]).toEqual({
        type: 'text',
        text: 'Agent was stopped by policy.',
      });
      const end = result[1] as AgentEvent<'stream_end'>;
      expect(end.reason).toBe('completed');
    });

    it('emits only stream_end when no systemMessage', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.AgentExecutionStopped,
        value: { reason: 'Done' },
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('stream_end');
    });
  });

  // -----------------------------------------------------------------------
  // AgentExecutionBlocked
  // -----------------------------------------------------------------------

  describe('AgentExecutionBlocked', () => {
    it('emits error + stream_end with failed', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.AgentExecutionBlocked,
        value: { reason: 'Policy violation' },
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(2);
      const err = result[0] as AgentEvent<'error'>;
      expect(err.status).toBe('PERMISSION_DENIED');
      expect(err.message).toBe('Policy violation');
      const end = result[1] as AgentEvent<'stream_end'>;
      expect(end.reason).toBe('failed');
    });
  });

  // -----------------------------------------------------------------------
  // InvalidStream
  // -----------------------------------------------------------------------

  describe('InvalidStream', () => {
    it('emits error with INTERNAL', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.InvalidStream,
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const err = result[0] as AgentEvent<'error'>;
      expect(err.status).toBe('INTERNAL');
      expect(err.fatal).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // ChatCompressed, Retry — no output
  // -----------------------------------------------------------------------

  describe('ChatCompressed', () => {
    it('emits nothing', () => {
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ChatCompressed,
        value: null,
      };
      expect(translateEvent(event, state)).toEqual([]);
    });
  });

  describe('Retry', () => {
    it('emits nothing', () => {
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Retry,
      };
      expect(translateEvent(event, state)).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // ToolCallRequest
  // -----------------------------------------------------------------------

  describe('ToolCallRequest', () => {
    it('emits tool_request with requestId, name, and args', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId: 'call-1',
          name: 'read_file',
          args: { path: '/tmp/test.txt' },
          isClientInitiated: false,
          prompt_id: 'p1',
        },
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const req = result[0] as AgentEvent<'tool_request'>;
      expect(req.type).toBe('tool_request');
      expect(req.requestId).toBe('call-1');
      expect(req.name).toBe('read_file');
      expect(req.args).toEqual({ path: '/tmp/test.txt' });
    });

    it('auto-emits stream_start if not yet emitted', () => {
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId: 'call-1',
          name: 'write_file',
          args: { path: '/tmp/out.txt', content: 'hi' },
          isClientInitiated: false,
          prompt_id: 'p1',
        },
      };

      const result = translateEvent(event, state);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('stream_start');
      expect(result[1].type).toBe('tool_request');
    });

    it('tracks tool name in pendingToolNames', () => {
      state.streamStartEmitted = true;
      translateEvent(
        {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'call-42',
            name: 'edit_file',
            args: {},
            isClientInitiated: false,
            prompt_id: 'p1',
          },
        },
        state,
      );

      expect(state.pendingToolNames.get('call-42')).toBe('edit_file');
    });
  });

  // -----------------------------------------------------------------------
  // ToolCallResponse
  // -----------------------------------------------------------------------

  describe('ToolCallResponse', () => {
    it('emits tool_response with name resolved from pending request', () => {
      state.streamStartEmitted = true;

      // First, register the tool request
      translateEvent(
        {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'call-1',
            name: 'read_file',
            args: { path: '/tmp/test.txt' },
            isClientInitiated: false,
            prompt_id: 'p1',
          },
        },
        state,
      );

      // Then, the response
      const result = translateEvent(
        {
          type: GeminiEventType.ToolCallResponse,
          value: {
            callId: 'call-1',
            responseParts: [{ text: 'file contents here' }],
            resultDisplay: undefined,
            error: undefined,
            errorType: undefined,
          },
        },
        state,
      );

      expect(result).toHaveLength(1);
      const resp = result[0] as AgentEvent<'tool_response'>;
      expect(resp.type).toBe('tool_response');
      expect(resp.requestId).toBe('call-1');
      expect(resp.name).toBe('read_file');
      expect(resp.content).toEqual([
        { type: 'text', text: 'file contents here' },
      ]);
      expect(resp.isError).toBe(false);
    });

    it('uses "unknown" name when no prior request exists', () => {
      state.streamStartEmitted = true;

      const result = translateEvent(
        {
          type: GeminiEventType.ToolCallResponse,
          value: {
            callId: 'orphan-call',
            responseParts: [{ text: 'data' }],
            resultDisplay: undefined,
            error: undefined,
            errorType: undefined,
          },
        },
        state,
      );

      const resp = result[0] as AgentEvent<'tool_response'>;
      expect(resp.name).toBe('unknown');
    });

    it('sets isError when error is present', () => {
      state.streamStartEmitted = true;
      state.pendingToolNames.set('call-err', 'dangerous_tool');

      const result = translateEvent(
        {
          type: GeminiEventType.ToolCallResponse,
          value: {
            callId: 'call-err',
            responseParts: [{ text: 'Error: permission denied' }],
            resultDisplay: undefined,
            error: new Error('permission denied'),
            errorType: undefined,
          },
        },
        state,
      );

      const resp = result[0] as AgentEvent<'tool_response'>;
      expect(resp.isError).toBe(true);
      expect(resp.name).toBe('dangerous_tool');
    });

    it('passes through data field when present', () => {
      state.streamStartEmitted = true;
      state.pendingToolNames.set('call-data', 'search');

      const result = translateEvent(
        {
          type: GeminiEventType.ToolCallResponse,
          value: {
            callId: 'call-data',
            responseParts: [{ text: 'results' }],
            resultDisplay: undefined,
            error: undefined,
            errorType: undefined,
            data: { resultCount: 5 },
          },
        },
        state,
      );

      const resp = result[0] as AgentEvent<'tool_response'>;
      expect(resp.data).toEqual({ resultCount: 5 });
    });

    it('handles multiple response parts including media', () => {
      state.streamStartEmitted = true;
      state.pendingToolNames.set('call-multi', 'screenshot');

      const result = translateEvent(
        {
          type: GeminiEventType.ToolCallResponse,
          value: {
            callId: 'call-multi',
            responseParts: [
              { text: 'Screenshot taken' },
              { inlineData: { mimeType: 'image/png', data: 'base64data' } },
            ],
            resultDisplay: undefined,
            error: undefined,
            errorType: undefined,
          },
        },
        state,
      );

      const resp = result[0] as AgentEvent<'tool_response'>;
      expect(resp.content).toEqual([
        { type: 'text', text: 'Screenshot taken' },
        { type: 'media', data: 'base64data', mimeType: 'image/png' },
      ]);
    });

    it('cleans up pendingToolNames after response', () => {
      state.streamStartEmitted = true;
      state.pendingToolNames.set('call-cleanup', 'list_files');

      translateEvent(
        {
          type: GeminiEventType.ToolCallResponse,
          value: {
            callId: 'call-cleanup',
            responseParts: [],
            resultDisplay: undefined,
            error: undefined,
            errorType: undefined,
          },
        },
        state,
      );

      expect(state.pendingToolNames.has('call-cleanup')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // ToolCallConfirmation — skipped
  // -----------------------------------------------------------------------

  describe('ToolCallConfirmation', () => {
    it('emits nothing', () => {
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ToolCallConfirmation,
        value: {
          request: {
            callId: 'call-1',
            name: 'delete_file',
            args: {},
            isClientInitiated: false,
            prompt_id: 'p1',
          },
          details:
            {} as unknown as import('../tools/tools.js').ToolCallConfirmationDetails,
        },
      };
      expect(translateEvent(event, state)).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Tool events in happy path sequence
  // -----------------------------------------------------------------------

  describe('tool call sequence', () => {
    it('ModelInfo → Content → ToolCallRequest → ToolCallResponse → Finished', () => {
      const events: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
        { type: GeminiEventType.Content, value: 'Let me read that file.' },
        {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'call-1',
            name: 'read_file',
            args: { path: '/tmp/test.txt' },
            isClientInitiated: false,
            prompt_id: 'p1',
          },
        },
        {
          type: GeminiEventType.ToolCallResponse,
          value: {
            callId: 'call-1',
            responseParts: [{ text: 'file contents' }],
            resultDisplay: undefined,
            error: undefined,
            errorType: undefined,
          },
        },
        {
          type: GeminiEventType.Finished,
          value: {
            reason: FinishReason.STOP,
            usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 15 },
          },
        },
      ];

      const allAgentEvents: AgentEvent[] = [];
      for (const ev of events) {
        allAgentEvents.push(...translateEvent(ev, state));
      }

      expect(allAgentEvents.map((e) => e.type)).toEqual([
        'stream_start',
        'message',
        'tool_request',
        'tool_response',
        'usage',
        'stream_end',
      ]);

      // Verify tool_request details
      const toolReq = allAgentEvents[2] as AgentEvent<'tool_request'>;
      expect(toolReq.requestId).toBe('call-1');
      expect(toolReq.name).toBe('read_file');

      // Verify tool_response has resolved name
      const toolResp = allAgentEvents[3] as AgentEvent<'tool_response'>;
      expect(toolResp.requestId).toBe('call-1');
      expect(toolResp.name).toBe('read_file');
      expect(toolResp.isError).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Happy path sequence test
  // -----------------------------------------------------------------------

  describe('happy path sequence', () => {
    it('ModelInfo → Content → Content → Finished produces correct trajectory', () => {
      const events: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.ModelInfo, value: 'gemini-2.5-pro' },
        { type: GeminiEventType.Content, value: 'Hello ' },
        { type: GeminiEventType.Content, value: 'world!' },
        {
          type: GeminiEventType.Finished,
          value: {
            reason: FinishReason.STOP,
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 5,
            },
          },
        },
      ];

      const allAgentEvents: AgentEvent[] = [];
      for (const ev of events) {
        allAgentEvents.push(...translateEvent(ev, state));
      }

      expect(allAgentEvents.map((e) => e.type)).toEqual([
        'stream_start',
        'message',
        'message',
        'usage',
        'stream_end',
      ]);

      // Verify IDs are sequential
      for (let i = 0; i < allAgentEvents.length; i++) {
        expect(allAgentEvents[i].id).toBe(`test-stream-id-${i}`);
      }

      // Verify streamId is consistent
      for (const ev of allAgentEvents) {
        expect(ev.streamId).toBe('test-stream-id');
      }
    });
  });

  // -----------------------------------------------------------------------
  // mapFinishReason — all values
  // -----------------------------------------------------------------------

  describe('mapFinishReason', () => {
    const cases: Array<[string | undefined, string]> = [
      [undefined, 'completed'],
      ['STOP', 'completed'],
      ['FINISH_REASON_UNSPECIFIED', 'completed'],
      ['MAX_TOKENS', 'max_budget'],
      ['SAFETY', 'refusal'],
      ['RECITATION', 'refusal'],
      ['LANGUAGE', 'refusal'],
      ['BLOCKLIST', 'refusal'],
      ['PROHIBITED_CONTENT', 'refusal'],
      ['SPII', 'refusal'],
      ['MALFORMED_FUNCTION_CALL', 'failed'],
      ['OTHER', 'failed'],
    ];

    for (const [input, expected] of cases) {
      it(`maps ${String(input)} → ${expected}`, () => {
        expect(mapFinishReason(input as FinishReason | undefined)).toBe(
          expected,
        );
      });
    }
  });

  // -----------------------------------------------------------------------
  // mapHttpToGrpcStatus
  // -----------------------------------------------------------------------

  describe('mapHttpToGrpcStatus', () => {
    const cases: Array<[number | undefined, string]> = [
      [undefined, 'INTERNAL'],
      [400, 'INVALID_ARGUMENT'],
      [401, 'UNAUTHENTICATED'],
      [403, 'PERMISSION_DENIED'],
      [404, 'NOT_FOUND'],
      [409, 'ALREADY_EXISTS'],
      [429, 'RESOURCE_EXHAUSTED'],
      [500, 'INTERNAL'],
      [501, 'UNIMPLEMENTED'],
      [503, 'UNAVAILABLE'],
      [504, 'DEADLINE_EXCEEDED'],
      [418, 'INTERNAL'], // unmapped → INTERNAL
    ];

    for (const [input, expected] of cases) {
      it(`maps ${String(input)} → ${expected}`, () => {
        expect(mapHttpToGrpcStatus(input)).toBe(expected);
      });
    }
  });

  // -----------------------------------------------------------------------
  // mapError
  // -----------------------------------------------------------------------

  describe('mapError', () => {
    it('maps StructuredError with status', () => {
      const result = mapError({ message: 'Unauthorized', status: 401 });
      expect(result.status).toBe('UNAUTHENTICATED');
      expect(result.message).toBe('Unauthorized');
    });

    it('maps StructuredError without status', () => {
      const result = mapError({ message: 'Unknown error' });
      expect(result.status).toBe('INTERNAL');
    });

    it('maps Error instance', () => {
      const result = mapError(new Error('boom'));
      expect(result.status).toBe('INTERNAL');
      expect(result.message).toBe('boom');
    });

    it('maps primitive value', () => {
      const result = mapError('something went wrong');
      expect(result.status).toBe('INTERNAL');
      expect(result.message).toBe('something went wrong');
    });
  });

  // -----------------------------------------------------------------------
  // mapUsage
  // -----------------------------------------------------------------------

  describe('mapUsage', () => {
    it('maps all fields', () => {
      const result = mapUsage(
        {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          cachedContentTokenCount: 10,
        },
        'gemini-2.5-pro',
      );
      expect(result).toEqual({
        model: 'gemini-2.5-pro',
        inputTokens: 100,
        outputTokens: 50,
        cachedTokens: 10,
      });
    });

    it('uses "unknown" when model is not provided', () => {
      const result = mapUsage({});
      expect(result.model).toBe('unknown');
    });
  });

  // -----------------------------------------------------------------------
  // Event ID uniqueness and timestamps
  // -----------------------------------------------------------------------

  describe('event metadata', () => {
    it('generates unique sequential IDs', () => {
      state.streamStartEmitted = true;
      const r1 = translateEvent(
        { type: GeminiEventType.Content, value: 'a' },
        state,
      );
      const r2 = translateEvent(
        { type: GeminiEventType.Content, value: 'b' },
        state,
      );

      expect(r1[0].id).not.toBe(r2[0].id);
    });

    it('includes ISO 8601 timestamps', () => {
      state.streamStartEmitted = true;
      const result = translateEvent(
        { type: GeminiEventType.Content, value: 'test' },
        state,
      );
      // Verify it's a valid date string
      expect(new Date(result[0].timestamp).toISOString()).toBe(
        result[0].timestamp,
      );
    });
  });
});
