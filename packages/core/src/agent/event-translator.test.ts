/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { FinishReason } from '@google/genai';
import { ToolErrorType } from '../tools/tool-error.js';
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
import type { AgentEvent } from './types.js';

describe('createTranslationState', () => {
  it('creates state with default streamId', () => {
    const state = createTranslationState();
    expect(state.streamId).toBeDefined();
    expect(state.streamStartEmitted).toBe(false);
    expect(state.model).toBeUndefined();
    expect(state.eventCounter).toBe(0);
    expect(state.pendingToolNames.size).toBe(0);
  });

  it('creates state with custom streamId', () => {
    const state = createTranslationState('custom-stream');
    expect(state.streamId).toBe('custom-stream');
  });
});

describe('translateEvent', () => {
  let state: TranslationState;

  beforeEach(() => {
    state = createTranslationState('test-stream');
  });

  describe('Content events', () => {
    it('emits agent_start + message for first content event', () => {
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Content,
        value: 'Hello world',
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(2);
      expect(result[0]?.type).toBe('agent_start');
      expect(result[1]?.type).toBe('message');
      const msg = result[1] as AgentEvent<'message'>;
      expect(msg.role).toBe('agent');
      expect(msg.content).toEqual([{ type: 'text', text: 'Hello world' }]);
    });

    it('skips agent_start for subsequent content events', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Content,
        value: 'more text',
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      expect(result[0]?.type).toBe('message');
    });
  });

  describe('Thought events', () => {
    it('emits thought content with metadata', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Thought,
        value: { subject: 'Planning', description: 'I am thinking...' },
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const msg = result[0] as AgentEvent<'message'>;
      expect(msg.content).toEqual([
        { type: 'thought', thought: 'I am thinking...' },
      ]);
      expect(msg._meta?.['subject']).toBe('Planning');
    });
  });

  describe('ToolCallRequest events', () => {
    it('emits tool_request and tracks pending tool name', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId: 'call-1',
          name: 'read_file',
          args: { path: '/tmp/test' },
          isClientInitiated: false,
          prompt_id: 'p1',
        },
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const req = result[0] as AgentEvent<'tool_request'>;
      expect(req.requestId).toBe('call-1');
      expect(req.name).toBe('read_file');
      expect(req.args).toEqual({ path: '/tmp/test' });
      expect(state.pendingToolNames.get('call-1')).toBe('read_file');
    });
  });

  describe('ToolCallResponse events', () => {
    it('emits tool_response with content from responseParts', () => {
      state.streamStartEmitted = true;
      state.pendingToolNames.set('call-1', 'read_file');
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ToolCallResponse,
        value: {
          callId: 'call-1',
          responseParts: [{ text: 'file contents' }],
          resultDisplay: undefined,
          error: undefined,
          errorType: undefined,
        },
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const resp = result[0] as AgentEvent<'tool_response'>;
      expect(resp.requestId).toBe('call-1');
      expect(resp.name).toBe('read_file');
      expect(resp.content).toEqual([{ type: 'text', text: 'file contents' }]);
      expect(resp.isError).toBe(false);
      expect(state.pendingToolNames.has('call-1')).toBe(false);
    });

    it('uses error.message for content when tool errored', () => {
      state.streamStartEmitted = true;
      state.pendingToolNames.set('call-2', 'write_file');
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ToolCallResponse,
        value: {
          callId: 'call-2',
          responseParts: [{ text: 'stale parts' }],
          resultDisplay: 'Permission denied',
          error: new Error('Permission denied to write'),
          errorType: ToolErrorType.PERMISSION_DENIED,
        },
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const resp = result[0] as AgentEvent<'tool_response'>;
      expect(resp.isError).toBe(true);
      // Should use error.message, not responseParts
      expect(resp.content).toEqual([
        { type: 'text', text: 'Permission denied to write' },
      ]);
      expect(resp.displayContent).toEqual([
        { type: 'text', text: 'Permission denied' },
      ]);
      expect(resp.data).toEqual({ errorType: 'permission_denied' });
    });

    it('uses "unknown" name for untracked tool calls', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ToolCallResponse,
        value: {
          callId: 'untracked',
          responseParts: [{ text: 'data' }],
          resultDisplay: undefined,
          error: undefined,
          errorType: undefined,
        },
      };
      const result = translateEvent(event, state);
      const resp = result[0] as AgentEvent<'tool_response'>;
      expect(resp.name).toBe('unknown');
    });

    it('stringifies object resultDisplay correctly', () => {
      state.streamStartEmitted = true;
      state.pendingToolNames.set('call-3', 'diff_tool');
      const objectDisplay = {
        fileDiff: '@@ -1 +1 @@\n-a\n+b',
        fileName: 'test.txt',
        filePath: '/tmp/test.txt',
        originalContent: 'a',
        newContent: 'b',
      };
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ToolCallResponse,
        value: {
          callId: 'call-3',
          responseParts: [{ text: 'diff result' }],
          resultDisplay: objectDisplay,
          error: undefined,
          errorType: undefined,
        },
      };
      const result = translateEvent(event, state);
      const resp = result[0] as AgentEvent<'tool_response'>;
      expect(resp.displayContent).toEqual([
        { type: 'text', text: JSON.stringify(objectDisplay) },
      ]);
    });

    it('passes through string resultDisplay as-is', () => {
      state.streamStartEmitted = true;
      state.pendingToolNames.set('call-4', 'shell');
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ToolCallResponse,
        value: {
          callId: 'call-4',
          responseParts: [{ text: 'output' }],
          resultDisplay: 'Command output text',
          error: undefined,
          errorType: undefined,
        },
      };
      const result = translateEvent(event, state);
      const resp = result[0] as AgentEvent<'tool_response'>;
      expect(resp.displayContent).toEqual([
        { type: 'text', text: 'Command output text' },
      ]);
    });

    it('preserves outputFile and contentLength in data', () => {
      state.streamStartEmitted = true;
      state.pendingToolNames.set('call-5', 'write_file');
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ToolCallResponse,
        value: {
          callId: 'call-5',
          responseParts: [{ text: 'written' }],
          resultDisplay: undefined,
          error: undefined,
          errorType: undefined,
          outputFile: '/tmp/out.txt',
          contentLength: 42,
        },
      };
      const result = translateEvent(event, state);
      const resp = result[0] as AgentEvent<'tool_response'>;
      expect(resp.data?.['outputFile']).toBe('/tmp/out.txt');
      expect(resp.data?.['contentLength']).toBe(42);
    });

    it('handles multi-part responses (text + inlineData)', () => {
      state.streamStartEmitted = true;
      state.pendingToolNames.set('call-6', 'screenshot');
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ToolCallResponse,
        value: {
          callId: 'call-6',
          responseParts: [
            { text: 'Here is the screenshot' },
            { inlineData: { data: 'base64img', mimeType: 'image/png' } },
          ],
          resultDisplay: undefined,
          error: undefined,
          errorType: undefined,
        },
      };
      const result = translateEvent(event, state);
      const resp = result[0] as AgentEvent<'tool_response'>;
      expect(resp.content).toEqual([
        { type: 'text', text: 'Here is the screenshot' },
        { type: 'media', data: 'base64img', mimeType: 'image/png' },
      ]);
      expect(resp.isError).toBe(false);
    });
  });

  describe('Error events', () => {
    it('emits error event for structured errors', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Error,
        value: { error: { message: 'Rate limited', status: 429 } },
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const err = result[0] as AgentEvent<'error'>;
      expect(err.status).toBe('RESOURCE_EXHAUSTED');
      expect(err.message).toBe('Rate limited');
      expect(err.fatal).toBe(true);
    });

    it('emits error event for Error instances', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Error,
        value: { error: new Error('Something broke') },
      };
      const result = translateEvent(event, state);
      const err = result[0] as AgentEvent<'error'>;
      expect(err.status).toBe('INTERNAL');
      expect(err.message).toBe('Something broke');
    });
  });

  describe('ModelInfo events', () => {
    it('emits agent_start and session_update when no stream started yet', () => {
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ModelInfo,
        value: 'gemini-2.5-pro',
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(2);
      expect(result[0]?.type).toBe('agent_start');
      expect(result[1]?.type).toBe('session_update');
      const sessionUpdate = result[1] as AgentEvent<'session_update'>;
      expect(sessionUpdate.model).toBe('gemini-2.5-pro');
      expect(state.model).toBe('gemini-2.5-pro');
      expect(state.streamStartEmitted).toBe(true);
    });

    it('emits session_update when stream already started', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ModelInfo,
        value: 'gemini-2.5-flash',
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      expect(result[0]?.type).toBe('session_update');
    });
  });

  describe('AgentExecutionStopped events', () => {
    it('emits agent_end with the final stop message in data.message', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.AgentExecutionStopped,
        value: {
          reason: 'before_model',
          systemMessage: 'Stopped by hook',
          contextCleared: true,
        },
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const streamEnd = result[0] as AgentEvent<'agent_end'>;
      expect(streamEnd.type).toBe('agent_end');
      expect(streamEnd.reason).toBe('completed');
      expect(streamEnd.data).toEqual({ message: 'Stopped by hook' });
    });

    it('uses reason when systemMessage is not set', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.AgentExecutionStopped,
        value: { reason: 'hook' },
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const streamEnd = result[0] as AgentEvent<'agent_end'>;
      expect(streamEnd.data).toEqual({ message: 'hook' });
    });
  });

  describe('AgentExecutionBlocked events', () => {
    it('emits non-fatal error event (non-terminal, stream continues)', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.AgentExecutionBlocked,
        value: { reason: 'Policy violation' },
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const err = result[0] as AgentEvent<'error'>;
      expect(err.type).toBe('error');
      expect(err.fatal).toBe(false);
      expect(err._meta?.['code']).toBe('AGENT_EXECUTION_BLOCKED');
      expect(err.message).toBe('Agent execution blocked: Policy violation');
    });

    it('uses systemMessage in the final error message when available', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.AgentExecutionBlocked,
        value: {
          reason: 'hook_blocked',
          systemMessage: 'Blocked by policy hook',
          contextCleared: true,
        },
      };
      const result = translateEvent(event, state);
      const err = result[0] as AgentEvent<'error'>;
      expect(err.message).toBe(
        'Agent execution blocked: Blocked by policy hook',
      );
    });
  });

  describe('LoopDetected events', () => {
    it('emits a non-fatal warning error event', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.LoopDetected,
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      expect(result[0]?.type).toBe('error');
      const loopWarning = result[0] as AgentEvent<'error'>;
      expect(loopWarning.fatal).toBe(false);
      expect(loopWarning.message).toBe('Loop detected, stopping execution');
      expect(loopWarning._meta?.['code']).toBe('LOOP_DETECTED');
    });
  });

  describe('MaxSessionTurns events', () => {
    it('emits agent_end with max_turns', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.MaxSessionTurns,
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const streamEnd = result[0] as AgentEvent<'agent_end'>;
      expect(streamEnd.type).toBe('agent_end');
      expect(streamEnd.reason).toBe('max_turns');
      expect(streamEnd.data).toEqual({ code: 'MAX_TURNS_EXCEEDED' });
    });
  });

  describe('Finished events', () => {
    it('emits usage for STOP', () => {
      state.streamStartEmitted = true;
      state.model = 'gemini-2.5-pro';
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
      expect(result).toHaveLength(1);

      const usage = result[0] as AgentEvent<'usage'>;
      expect(usage.model).toBe('gemini-2.5-pro');
      expect(usage.inputTokens).toBe(100);
      expect(usage.outputTokens).toBe(50);
      expect(usage.cachedTokens).toBe(10);
    });

    it('emits nothing when no usage metadata is present', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Finished,
        value: { reason: undefined, usageMetadata: undefined },
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(0);
    });
  });

  describe('Citation events', () => {
    it('emits message with citation meta', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Citation,
        value: 'Source: example.com',
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const msg = result[0] as AgentEvent<'message'>;
      expect(msg.content).toEqual([
        { type: 'text', text: 'Source: example.com' },
      ]);
      expect(msg._meta?.['citation']).toBe(true);
    });
  });

  describe('UserCancelled events', () => {
    it('emits agent_end with reason aborted', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.UserCancelled,
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const end = result[0] as AgentEvent<'agent_end'>;
      expect(end.type).toBe('agent_end');
      expect(end.reason).toBe('aborted');
    });
  });

  describe('ContextWindowWillOverflow events', () => {
    it('emits fatal error', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ContextWindowWillOverflow,
        value: {
          estimatedRequestTokenCount: 150000,
          remainingTokenCount: 10000,
        },
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const err = result[0] as AgentEvent<'error'>;
      expect(err.status).toBe('RESOURCE_EXHAUSTED');
      expect(err.fatal).toBe(true);
      expect(err.message).toContain('150000');
      expect(err.message).toContain('10000');
    });
  });

  describe('InvalidStream events', () => {
    it('emits fatal error', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.InvalidStream,
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const err = result[0] as AgentEvent<'error'>;
      expect(err.status).toBe('INTERNAL');
      expect(err.message).toBe('Invalid stream received from model');
      expect(err.fatal).toBe(true);
    });
  });

  describe('Events with no output', () => {
    it('returns empty for Retry', () => {
      const result = translateEvent({ type: GeminiEventType.Retry }, state);
      expect(result).toEqual([]);
    });

    it('returns empty for ChatCompressed with null', () => {
      const result = translateEvent(
        { type: GeminiEventType.ChatCompressed, value: null },
        state,
      );
      expect(result).toEqual([]);
    });

    it('returns empty for ToolCallConfirmation', () => {
      // ToolCallConfirmation is skipped in non-interactive mode (elicitations
      // are deferred to the interactive runtime adaptation).
      const event = {
        type: GeminiEventType.ToolCallConfirmation,
        value: {
          request: {
            callId: 'c1',
            name: 'tool',
            args: {},
            isClientInitiated: false,
            prompt_id: 'p1',
          },
          details: { type: 'info', title: 'Confirm', prompt: 'Confirm?' },
        },
      } as ServerGeminiStreamEvent;
      const result = translateEvent(event, state);
      expect(result).toEqual([]);
    });
  });

  describe('Event IDs', () => {
    it('generates sequential IDs', () => {
      state.streamStartEmitted = true;
      const e1 = translateEvent(
        { type: GeminiEventType.Content, value: 'a' },
        state,
      );
      const e2 = translateEvent(
        { type: GeminiEventType.Content, value: 'b' },
        state,
      );
      expect(e1[0]?.id).toBe('test-stream-0');
      expect(e2[0]?.id).toBe('test-stream-1');
    });

    it('includes streamId in events', () => {
      const events = translateEvent(
        { type: GeminiEventType.Content, value: 'hi' },
        state,
      );
      for (const e of events) {
        expect(e.streamId).toBe('test-stream');
      }
    });
  });
});

describe('mapFinishReason', () => {
  it('maps STOP to completed', () => {
    expect(mapFinishReason(FinishReason.STOP)).toBe('completed');
  });

  it('maps undefined to completed', () => {
    expect(mapFinishReason(undefined)).toBe('completed');
  });

  it('maps MAX_TOKENS to max_budget', () => {
    expect(mapFinishReason(FinishReason.MAX_TOKENS)).toBe('max_budget');
  });

  it('maps SAFETY to refusal', () => {
    expect(mapFinishReason(FinishReason.SAFETY)).toBe('refusal');
  });

  it('maps MALFORMED_FUNCTION_CALL to failed', () => {
    expect(mapFinishReason(FinishReason.MALFORMED_FUNCTION_CALL)).toBe(
      'failed',
    );
  });

  it('maps RECITATION to refusal', () => {
    expect(mapFinishReason(FinishReason.RECITATION)).toBe('refusal');
  });

  it('maps LANGUAGE to refusal', () => {
    expect(mapFinishReason(FinishReason.LANGUAGE)).toBe('refusal');
  });

  it('maps BLOCKLIST to refusal', () => {
    expect(mapFinishReason(FinishReason.BLOCKLIST)).toBe('refusal');
  });

  it('maps OTHER to failed', () => {
    expect(mapFinishReason(FinishReason.OTHER)).toBe('failed');
  });

  it('maps PROHIBITED_CONTENT to refusal', () => {
    expect(mapFinishReason(FinishReason.PROHIBITED_CONTENT)).toBe('refusal');
  });

  it('maps IMAGE_SAFETY to refusal', () => {
    expect(mapFinishReason(FinishReason.IMAGE_SAFETY)).toBe('refusal');
  });

  it('maps IMAGE_PROHIBITED_CONTENT to refusal', () => {
    expect(mapFinishReason(FinishReason.IMAGE_PROHIBITED_CONTENT)).toBe(
      'refusal',
    );
  });

  it('maps UNEXPECTED_TOOL_CALL to failed', () => {
    expect(mapFinishReason(FinishReason.UNEXPECTED_TOOL_CALL)).toBe('failed');
  });

  it('maps NO_IMAGE to failed', () => {
    expect(mapFinishReason(FinishReason.NO_IMAGE)).toBe('failed');
  });
});

describe('mapHttpToGrpcStatus', () => {
  it('maps 400 to INVALID_ARGUMENT', () => {
    expect(mapHttpToGrpcStatus(400)).toBe('INVALID_ARGUMENT');
  });

  it('maps 401 to UNAUTHENTICATED', () => {
    expect(mapHttpToGrpcStatus(401)).toBe('UNAUTHENTICATED');
  });

  it('maps 429 to RESOURCE_EXHAUSTED', () => {
    expect(mapHttpToGrpcStatus(429)).toBe('RESOURCE_EXHAUSTED');
  });

  it('maps undefined to INTERNAL', () => {
    expect(mapHttpToGrpcStatus(undefined)).toBe('INTERNAL');
  });

  it('maps unknown codes to INTERNAL', () => {
    expect(mapHttpToGrpcStatus(418)).toBe('INTERNAL');
  });
});

describe('mapError', () => {
  it('maps structured errors with status', () => {
    const result = mapError({ message: 'Rate limit', status: 429 });
    expect(result.status).toBe('RESOURCE_EXHAUSTED');
    expect(result.message).toBe('Rate limit');
    expect(result.fatal).toBe(true);
    expect(result._meta?.['rawError']).toEqual({
      message: 'Rate limit',
      status: 429,
    });
  });

  it('maps Error instances', () => {
    const result = mapError(new Error('Something failed'));
    expect(result.status).toBe('INTERNAL');
    expect(result.message).toBe('Something failed');
  });

  it('preserves error name in _meta', () => {
    class CustomError extends Error {
      constructor(msg: string) {
        super(msg);
      }
    }
    const result = mapError(new CustomError('test'));
    expect(result._meta?.['errorName']).toBe('CustomError');
  });

  it('maps non-Error values to string', () => {
    const result = mapError('raw string error');
    expect(result.message).toBe('raw string error');
    expect(result.status).toBe('INTERNAL');
  });
});

describe('mapUsage', () => {
  it('maps all fields', () => {
    const result = mapUsage(
      {
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        cachedContentTokenCount: 25,
      },
      'gemini-2.5-pro',
    );
    expect(result).toEqual({
      model: 'gemini-2.5-pro',
      inputTokens: 100,
      outputTokens: 50,
      cachedTokens: 25,
    });
  });

  it('uses "unknown" for missing model', () => {
    const result = mapUsage({});
    expect(result.model).toBe('unknown');
  });
});
