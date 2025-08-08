/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Turn,
  GeminiEventType,
  ServerGeminiToolCallRequestEvent,
  ServerGeminiErrorEvent,
} from './turn.js';
import { GenerateContentResponse, Part, Content } from '@google/genai';
import { reportError } from '../utils/errorReporting.js';
import { GeminiChat } from './geminiChat.js';

const mockSendMessageStream = vi.fn();
const mockGetHistory = vi.fn();
const mockMaybeIncludeSchemaDepthContext = vi.fn();

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  const MockChat = vi.fn().mockImplementation(() => ({
    sendMessageStream: mockSendMessageStream,
    getHistory: mockGetHistory,
    maybeIncludeSchemaDepthContext: mockMaybeIncludeSchemaDepthContext,
  }));
  return {
    ...actual,
    Chat: MockChat,
  };
});

vi.mock('../utils/errorReporting', () => ({
  reportError: vi.fn(),
}));

vi.mock('../utils/generateContentResponseUtilities', () => ({
  getResponseText: (resp: GenerateContentResponse) =>
    resp.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') ||
    undefined,
}));

describe('Turn', () => {
  let turn: Turn;
  // Define a type for the mocked Chat instance for clarity
  type MockedChatInstance = {
    sendMessageStream: typeof mockSendMessageStream;
    getHistory: typeof mockGetHistory;
    maybeIncludeSchemaDepthContext: typeof mockMaybeIncludeSchemaDepthContext;
  };
  let mockChatInstance: MockedChatInstance;

  beforeEach(() => {
    vi.resetAllMocks();
    mockChatInstance = {
      sendMessageStream: mockSendMessageStream,
      getHistory: mockGetHistory,
      maybeIncludeSchemaDepthContext: mockMaybeIncludeSchemaDepthContext,
    };
    turn = new Turn(mockChatInstance as unknown as GeminiChat, 'prompt-id-1');
    mockGetHistory.mockReturnValue([]);
    mockSendMessageStream.mockResolvedValue((async function* () {})());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize pendingToolCalls and debugResponses', () => {
      expect(turn.pendingToolCalls).toEqual([]);
      expect(turn.getDebugResponses()).toEqual([]);
    });
  });

  describe('run', () => {
    it('should yield content events for text parts', async () => {
      const mockResponseStream = (async function* () {
        yield {
          candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
        } as unknown as GenerateContentResponse;
        yield {
          candidates: [{ content: { parts: [{ text: ' world' }] } }],
        } as unknown as GenerateContentResponse;
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      const reqParts: Part[] = [{ text: 'Hi' }];
      for await (const event of turn.run(
        reqParts,
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(mockSendMessageStream).toHaveBeenCalledWith(
        {
          message: reqParts,
          config: { abortSignal: expect.any(AbortSignal) },
        },
        'prompt-id-1',
      );

      expect(events).toEqual([
        { type: GeminiEventType.Content, value: 'Hello' },
        { type: GeminiEventType.Content, value: ' world' },
      ]);
      expect(turn.getDebugResponses().length).toBe(2);
    });

    it('should yield tool_call_request events for function calls', async () => {
      const mockResponseStream = (async function* () {
        yield {
          functionCalls: [
            {
              id: 'fc1',
              name: 'tool1',
              args: { arg1: 'val1' },
              isClientInitiated: false,
            },
            { name: 'tool2', args: { arg2: 'val2' }, isClientInitiated: false }, // No ID
          ],
        } as unknown as GenerateContentResponse;
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      const reqParts: Part[] = [{ text: 'Use tools' }];
      for await (const event of turn.run(
        reqParts,
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events.length).toBe(2);
      const event1 = events[0] as ServerGeminiToolCallRequestEvent;
      expect(event1.type).toBe(GeminiEventType.ToolCallRequest);
      expect(event1.value).toEqual(
        expect.objectContaining({
          callId: 'fc1',
          name: 'tool1',
          args: { arg1: 'val1' },
          isClientInitiated: false,
        }),
      );
      expect(turn.pendingToolCalls[0]).toEqual(event1.value);

      const event2 = events[1] as ServerGeminiToolCallRequestEvent;
      expect(event2.type).toBe(GeminiEventType.ToolCallRequest);
      expect(event2.value).toEqual(
        expect.objectContaining({
          name: 'tool2',
          args: { arg2: 'val2' },
          isClientInitiated: false,
        }),
      );
      expect(event2.value.callId).toEqual(
        expect.stringMatching(/^tool2-\d{13}-\w{10,}$/),
      );
      expect(turn.pendingToolCalls[1]).toEqual(event2.value);
      expect(turn.getDebugResponses().length).toBe(1);
    });

    it('should yield UserCancelled event if signal is aborted', async () => {
      const abortController = new AbortController();
      const mockResponseStream = (async function* () {
        yield {
          candidates: [{ content: { parts: [{ text: 'First part' }] } }],
        } as unknown as GenerateContentResponse;
        abortController.abort();
        yield {
          candidates: [
            {
              content: {
                parts: [{ text: 'Second part - should not be processed' }],
              },
            },
          ],
        } as unknown as GenerateContentResponse;
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      const reqParts: Part[] = [{ text: 'Test abort' }];
      for await (const event of turn.run(reqParts, abortController.signal)) {
        events.push(event);
      }
      expect(events).toEqual([
        { type: GeminiEventType.Content, value: 'First part' },
        { type: GeminiEventType.UserCancelled },
      ]);
      expect(turn.getDebugResponses().length).toBe(1);
    });

    it('should yield Error event and report if sendMessageStream throws', async () => {
      const error = new Error('API Error');
      mockSendMessageStream.mockRejectedValue(error);
      const reqParts: Part[] = [{ text: 'Trigger error' }];
      const historyContent: Content[] = [
        { role: 'model', parts: [{ text: 'Previous history' }] },
      ];
      mockGetHistory.mockReturnValue(historyContent);
      mockMaybeIncludeSchemaDepthContext.mockResolvedValue(undefined);
      const events = [];
      for await (const event of turn.run(
        reqParts,
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events.length).toBe(1);
      const errorEvent = events[0] as ServerGeminiErrorEvent;
      expect(errorEvent.type).toBe(GeminiEventType.Error);
      expect(errorEvent.value).toEqual({
        error: { message: 'API Error', status: undefined },
      });
      expect(turn.getDebugResponses().length).toBe(0);
      expect(reportError).toHaveBeenCalledWith(
        error,
        'Error when talking to Gemini API',
        [...historyContent, reqParts],
        'Turn.run-sendMessageStream',
      );
    });

    it('should handle function calls with undefined name or args', async () => {
      const mockResponseStream = (async function* () {
        yield {
          functionCalls: [
            { id: 'fc1', name: undefined, args: { arg1: 'val1' } },
            { id: 'fc2', name: 'tool2', args: undefined },
            { id: 'fc3', name: undefined, args: undefined },
          ],
        } as unknown as GenerateContentResponse;
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);
      const events = [];
      const reqParts: Part[] = [{ text: 'Test undefined tool parts' }];
      for await (const event of turn.run(
        reqParts,
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events.length).toBe(3);
      const event1 = events[0] as ServerGeminiToolCallRequestEvent;
      expect(event1.type).toBe(GeminiEventType.ToolCallRequest);
      expect(event1.value).toEqual(
        expect.objectContaining({
          callId: 'fc1',
          name: 'undefined_tool_name',
          args: { arg1: 'val1' },
          isClientInitiated: false,
        }),
      );
      expect(turn.pendingToolCalls[0]).toEqual(event1.value);

      const event2 = events[1] as ServerGeminiToolCallRequestEvent;
      expect(event2.type).toBe(GeminiEventType.ToolCallRequest);
      expect(event2.value).toEqual(
        expect.objectContaining({
          callId: 'fc2',
          name: 'tool2',
          args: {},
          isClientInitiated: false,
        }),
      );
      expect(turn.pendingToolCalls[1]).toEqual(event2.value);

      const event3 = events[2] as ServerGeminiToolCallRequestEvent;
      expect(event3.type).toBe(GeminiEventType.ToolCallRequest);
      expect(event3.value).toEqual(
        expect.objectContaining({
          callId: 'fc3',
          name: 'undefined_tool_name',
          args: {},
          isClientInitiated: false,
        }),
      );
      expect(turn.pendingToolCalls[2]).toEqual(event3.value);
      expect(turn.getDebugResponses().length).toBe(1);
    });

    it('should yield finished event when response has finish reason', async () => {
      const mockResponseStream = (async function* () {
        yield {
          candidates: [
            {
              content: { parts: [{ text: 'Partial response' }] },
              finishReason: 'STOP',
            },
          ],
        } as unknown as GenerateContentResponse;
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      const reqParts: Part[] = [{ text: 'Test finish reason' }];
      for await (const event of turn.run(
        reqParts,
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: GeminiEventType.Content, value: 'Partial response' },
        { type: GeminiEventType.Finished, value: 'STOP' },
      ]);
    });

    it('should yield finished event for MAX_TOKENS finish reason', async () => {
      const mockResponseStream = (async function* () {
        yield {
          candidates: [
            {
              content: {
                parts: [
                  { text: 'This is a long response that was cut off...' },
                ],
              },
              finishReason: 'MAX_TOKENS',
            },
          ],
        } as unknown as GenerateContentResponse;
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      const reqParts: Part[] = [{ text: 'Generate long text' }];
      for await (const event of turn.run(
        reqParts,
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events).toEqual([
        {
          type: GeminiEventType.Content,
          value: 'This is a long response that was cut off...',
        },
        { type: GeminiEventType.Finished, value: 'MAX_TOKENS' },
      ]);
    });

    it('should yield finished event for SAFETY finish reason', async () => {
      const mockResponseStream = (async function* () {
        yield {
          candidates: [
            {
              content: { parts: [{ text: 'Content blocked' }] },
              finishReason: 'SAFETY',
            },
          ],
        } as unknown as GenerateContentResponse;
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      const reqParts: Part[] = [{ text: 'Test safety' }];
      for await (const event of turn.run(
        reqParts,
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: GeminiEventType.Content, value: 'Content blocked' },
        { type: GeminiEventType.Finished, value: 'SAFETY' },
      ]);
    });

    it('should not yield finished event when there is no finish reason', async () => {
      const mockResponseStream = (async function* () {
        yield {
          candidates: [
            {
              content: { parts: [{ text: 'Response without finish reason' }] },
              // No finishReason property
            },
          ],
        } as unknown as GenerateContentResponse;
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      const reqParts: Part[] = [{ text: 'Test no finish reason' }];
      for await (const event of turn.run(
        reqParts,
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events).toEqual([
        {
          type: GeminiEventType.Content,
          value: 'Response without finish reason',
        },
      ]);
      // No Finished event should be emitted
    });

    it('should handle multiple responses with different finish reasons', async () => {
      const mockResponseStream = (async function* () {
        yield {
          candidates: [
            {
              content: { parts: [{ text: 'First part' }] },
              // No finish reason on first response
            },
          ],
        } as unknown as GenerateContentResponse;
        yield {
          candidates: [
            {
              content: { parts: [{ text: 'Second part' }] },
              finishReason: 'OTHER',
            },
          ],
        } as unknown as GenerateContentResponse;
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      const reqParts: Part[] = [{ text: 'Test multiple responses' }];
      for await (const event of turn.run(
        reqParts,
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: GeminiEventType.Content, value: 'First part' },
        { type: GeminiEventType.Content, value: 'Second part' },
        { type: GeminiEventType.Finished, value: 'OTHER' },
      ]);
    });
  });

  describe('getDebugResponses', () => {
    it('should return collected debug responses', async () => {
      const resp1 = {
        candidates: [{ content: { parts: [{ text: 'Debug 1' }] } }],
      } as unknown as GenerateContentResponse;
      const resp2 = {
        functionCalls: [{ name: 'debugTool' }],
      } as unknown as GenerateContentResponse;
      const mockResponseStream = (async function* () {
        yield resp1;
        yield resp2;
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);
      const reqParts: Part[] = [{ text: 'Hi' }];
      for await (const _ of turn.run(reqParts, new AbortController().signal)) {
        // consume stream
      }
      expect(turn.getDebugResponses()).toEqual([resp1, resp2]);
    });
  });
});
