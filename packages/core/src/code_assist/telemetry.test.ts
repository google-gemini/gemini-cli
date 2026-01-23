/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createConversationOffered,
  formatProtoJsonDuration,
  recordConversationOffered,
  recordToolCallInteractions,
} from './telemetry.js';
import {
  ActionStatus,
  ConversationInteractionInteraction,
  InitiationMethod,
  type StreamingLatency,
} from './types.js';
import {
  FinishReason,
  GenerateContentResponse,
  type FunctionCall,
} from '@google/genai';
import * as codeAssist from './codeAssist.js';
import type { CodeAssistServer } from './server.js';
import type { CompletedToolCall } from '../core/coreToolScheduler.js';
import {
  ToolConfirmationOutcome,
  type AnyDeclarativeTool,
  type AnyToolInvocation,
} from '../tools/tools.js';
import type { Config } from '../config/config.js';
import type { ToolCallResponseInfo } from '../scheduler/types.js';

function createMockResponse(
  candidates: GenerateContentResponse['candidates'] = [],
  ok = true,
  functionCalls: FunctionCall[] | undefined = undefined,
) {
  const response = new GenerateContentResponse();
  response.candidates = candidates;
  response.sdkHttpResponse = {
    responseInternal: {
      ok,
    } as unknown as Response,
    json: async () => ({}),
  };

  // If functionCalls is explicitly provided, mock the getter.
  // Otherwise, let the default behavior (if any) or undefined prevail.
  // In the real SDK, functionCalls is a getter derived from candidates.
  // For testing `createConversationOffered` which guards on functionCalls,
  // we often need to force it to be present.
  if (functionCalls !== undefined) {
    Object.defineProperty(response, 'functionCalls', {
      get: () => functionCalls,
      configurable: true,
    });
  }

  return response;
}

describe('telemetry', () => {
  describe('createConversationOffered', () => {
    it('should create a ConversationOffered object with correct values', () => {
      const response = createMockResponse(
        [
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
        ],
        true,
        [{ name: 'someTool', args: {} }],
      );
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
        initiationMethod: InitiationMethod.COMMAND,
      });
    });

    it('should return undefined if no function calls', () => {
      const response = createMockResponse(
        [
          {
            index: 0,
            content: {
              role: 'model',
              parts: [{ text: 'response without function calls' }],
            },
          },
        ],
        true,
        [], // Empty function calls
      );
      const result = createConversationOffered(
        response,
        'trace-id',
        undefined,
        {},
      );
      expect(result).toBeUndefined();
    });

    it('should set status to CANCELLED if signal is aborted', () => {
      const response = createMockResponse([], true, [
        { name: 'tool', args: {} },
      ]);
      const signal = new AbortController().signal;
      vi.spyOn(signal, 'aborted', 'get').mockReturnValue(true);

      const result = createConversationOffered(
        response,
        'trace-id',
        signal,
        {},
      );

      expect(result?.status).toBe(ActionStatus.ACTION_STATUS_CANCELLED);
    });

    it('should set status to ERROR_UNKNOWN if response has error (non-OK SDK response)', () => {
      const response = createMockResponse([], false, [
        { name: 'tool', args: {} },
      ]);

      const result = createConversationOffered(
        response,
        'trace-id',
        undefined,
        {},
      );

      expect(result?.status).toBe(ActionStatus.ACTION_STATUS_ERROR_UNKNOWN);
    });

    it('should set status to ERROR_UNKNOWN if finishReason is not STOP or MAX_TOKENS', () => {
      const response = createMockResponse(
        [
          {
            index: 0,
            finishReason: FinishReason.SAFETY,
          },
        ],
        true,
        [{ name: 'tool', args: {} }],
      );

      const result = createConversationOffered(
        response,
        'trace-id',
        undefined,
        {},
      );

      expect(result?.status).toBe(ActionStatus.ACTION_STATUS_ERROR_UNKNOWN);
    });

    it('should set status to EMPTY if candidates is empty', () => {
      // We force functionCalls to be present to bypass the guard,
      // simulating a state where we want to test the candidates check.
      const response = createMockResponse([], true, [
        { name: 'tool', args: {} },
      ]);

      const result = createConversationOffered(
        response,
        'trace-id',
        undefined,
        {},
      );

      expect(result?.status).toBe(ActionStatus.ACTION_STATUS_EMPTY);
    });

    it('should detect code in response', () => {
      const response = createMockResponse(
        [
          {
            index: 0,
            content: {
              parts: [
                { text: 'Here is some code:\n```js\nconsole.log("hi")\n```' },
              ],
            },
          },
        ],
        true,
        [{ name: 'tool', args: {} }],
      );
      const result = createConversationOffered(response, 'id', undefined, {});
      expect(result?.includedCode).toBe(true);
    });

    it('should not detect code if no backticks', () => {
      const response = createMockResponse(
        [
          {
            index: 0,
            content: {
              parts: [{ text: 'Here is some text.' }],
            },
          },
        ],
        true,
        [{ name: 'tool', args: {} }],
      );
      const result = createConversationOffered(response, 'id', undefined, {});
      expect(result?.includedCode).toBe(false);
    });
  });

  describe('formatProtoJsonDuration', () => {
    it('should format milliseconds to seconds string', () => {
      expect(formatProtoJsonDuration(1500)).toBe('1.5s');
      expect(formatProtoJsonDuration(100)).toBe('0.1s');
    });
  });

  describe('recordConversationOffered', () => {
    it('should call server.recordConversationOffered if traceId is present', async () => {
      const serverMock = {
        recordConversationOffered: vi.fn(),
      } as unknown as CodeAssistServer;

      const response = createMockResponse([], true, [
        { name: 'tool', args: {} },
      ]);
      const streamingLatency = {};

      await recordConversationOffered(
        serverMock,
        'trace-id',
        response,
        streamingLatency,
        undefined,
      );

      expect(serverMock.recordConversationOffered).toHaveBeenCalledWith(
        expect.objectContaining({
          traceId: 'trace-id',
        }),
      );
    });

    it('should not call server.recordConversationOffered if traceId is undefined', async () => {
      const serverMock = {
        recordConversationOffered: vi.fn(),
      } as unknown as CodeAssistServer;
      const response = createMockResponse([], true, [
        { name: 'tool', args: {} },
      ]);

      await recordConversationOffered(
        serverMock,
        undefined,
        response,
        {},
        undefined,
      );

      expect(serverMock.recordConversationOffered).not.toHaveBeenCalled();
    });
  });

  describe('recordToolCallInteractions', () => {
    let mockServer: { recordConversationInteraction: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockServer = {
        recordConversationInteraction: vi.fn(),
      };
      vi.spyOn(codeAssist, 'getCodeAssistServer').mockReturnValue(
        mockServer as unknown as CodeAssistServer,
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should record ACCEPT_FILE interaction for accepted edit tools', async () => {
      const toolCalls: CompletedToolCall[] = [
        {
          request: {
            name: 'replace', // in EDIT_TOOL_NAMES
            args: {},
            callId: 'call-1',
            isClientInitiated: false,
            prompt_id: 'p1',
            traceId: 'trace-1',
          },
          outcome: ToolConfirmationOutcome.ProceedOnce,
          status: 'success',
        } as unknown as CompletedToolCall,
      ];

      await recordToolCallInteractions({} as Config, toolCalls);

      expect(mockServer.recordConversationInteraction).toHaveBeenCalledWith({
        traceId: 'trace-1',
        status: ActionStatus.ACTION_STATUS_NO_ERROR,
        interaction: ConversationInteractionInteraction.ACCEPT_FILE,
        isAgentic: true,
      });
    });

    it('should record UNKNOWN interaction for other accepted tools', async () => {
      const toolCalls: CompletedToolCall[] = [
        {
          request: {
            name: 'read_file', // NOT in EDIT_TOOL_NAMES
            args: {},
            callId: 'call-2',
            isClientInitiated: false,
            prompt_id: 'p2',
            traceId: 'trace-2',
          },
          outcome: ToolConfirmationOutcome.ProceedOnce,
          status: 'success',
        } as unknown as CompletedToolCall,
      ];

      await recordToolCallInteractions({} as Config, toolCalls);

      expect(mockServer.recordConversationInteraction).toHaveBeenCalledWith({
        traceId: 'trace-2',
        status: ActionStatus.ACTION_STATUS_NO_ERROR,
        interaction: ConversationInteractionInteraction.UNKNOWN,
        isAgentic: true,
      });
    });

    it('should not record interaction for cancelled status', async () => {
      const toolCalls: CompletedToolCall[] = [
        {
          request: {
            name: 'tool',
            args: {},
            callId: 'call-3',
            isClientInitiated: false,
            prompt_id: 'p3',
            traceId: 'trace-3',
          },
          status: 'cancelled',
          response: {} as unknown as ToolCallResponseInfo,
          tool: {} as unknown as AnyDeclarativeTool,
          invocation: {} as unknown as AnyToolInvocation,
        } as CompletedToolCall,
      ];

      await recordToolCallInteractions({} as Config, toolCalls);

      expect(mockServer.recordConversationInteraction).not.toHaveBeenCalled();
    });

    it('should not record interaction for error status', async () => {
      const toolCalls: CompletedToolCall[] = [
        {
          request: {
            name: 'tool',
            args: {},
            callId: 'call-4',
            isClientInitiated: false,
            prompt_id: 'p4',
            traceId: 'trace-4',
          },
          status: 'error',
          response: {
            error: new Error('fail'),
          } as unknown as ToolCallResponseInfo,
        } as CompletedToolCall,
      ];

      await recordToolCallInteractions({} as Config, toolCalls);

      expect(mockServer.recordConversationInteraction).not.toHaveBeenCalled();
    });

    it('should not record interaction if tool calls are mixed or not 100% accepted', async () => {
      // Logic: traceId && acceptedToolCalls / toolCalls.length >= 1
      const toolCalls: CompletedToolCall[] = [
        {
          request: {
            name: 't1',
            args: {},
            callId: 'c1',
            isClientInitiated: false,
            prompt_id: 'p1',
            traceId: 't1',
          },
          outcome: ToolConfirmationOutcome.ProceedOnce,
          status: 'success',
        },
        {
          request: {
            name: 't2',
            args: {},
            callId: 'c2',
            isClientInitiated: false,
            prompt_id: 'p1',
            traceId: 't1',
          },
          outcome: ToolConfirmationOutcome.Cancel, // Rejected
          status: 'success',
        },
      ] as unknown as CompletedToolCall[];

      await recordToolCallInteractions({} as Config, toolCalls);

      expect(mockServer.recordConversationInteraction).not.toHaveBeenCalled();
    });
  });
});
