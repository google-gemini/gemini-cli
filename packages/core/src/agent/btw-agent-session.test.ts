/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeConfig } from '../test-utils/config.js';
import {
  createBtwAgentLoopContext,
  createBtwAgentSession,
} from './btw-agent-session.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { GeminiEventType } from '../core/turn.js';
import type { AgentEvent, AgentSend } from './types.js';

const mockInitialize = vi.fn();
const mockSetHistory = vi.fn();
const mockGetHistory = vi.fn();
const mockSendMessageStream = vi.fn();

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(function (this: {
    initialize: typeof mockInitialize;
    setHistory: typeof mockSetHistory;
    getHistory: typeof mockGetHistory;
    sendMessageStream: typeof mockSendMessageStream;
  }) {
    this.initialize = mockInitialize;
    this.setHistory = mockSetHistory;
    this.getHistory = mockGetHistory;
    this.sendMessageStream = mockSendMessageStream;
  }),
}));

function makeMessageSend(
  text: string,
): Extract<AgentSend, { message: unknown }> {
  return {
    message: {
      content: [{ type: 'text', text }],
    },
  };
}

async function collectEvents(
  session: Awaited<ReturnType<typeof createBtwAgentSession>>,
) {
  const events: AgentEvent[] = [];

  for await (const event of session.sendStream(makeMessageSend('btw'))) {
    events.push(event);
  }

  return events;
}

describe('btw-agent-session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialize.mockResolvedValue(undefined);
    mockSetHistory.mockResolvedValue(undefined);
    mockGetHistory.mockReturnValue([
      { role: 'user', parts: [{ text: 'root history' }] },
    ]);
    mockSendMessageStream.mockReturnValue(
      (async function* () {
        yield {
          type: 'content',
          value: 'Side answer',
        };
        yield {
          type: 'finished',
          value: {
            reason: 'STOP',
            usageMetadata: undefined,
          },
        };
      })(),
    );
  });

  it('creates a toolless isolated loop context', () => {
    const config = makeFakeConfig({});
    const parentContext = config as AgentLoopContext;

    const btwContext = createBtwAgentLoopContext(parentContext, 'btw-test');

    expect(btwContext.promptId).toBe('btw-test');
    expect(btwContext.parentSessionId).toBe(parentContext.promptId);
    expect(btwContext.toolRegistry.getAllToolNames()).toEqual([]);
    expect(btwContext.promptRegistry).not.toBe(parentContext.promptRegistry);
    expect(btwContext.resourceRegistry).not.toBe(
      parentContext.resourceRegistry,
    );
    expect(btwContext.messageBus).not.toBe(parentContext.messageBus);
    expect(btwContext.config.geminiClient).toBe(btwContext.geminiClient);
  });

  it('forks history into an isolated Gemini client session', async () => {
    const config = makeFakeConfig({});
    const parentContext = config as AgentLoopContext;
    vi.spyOn(parentContext.geminiClient, 'getHistory').mockReturnValue([
      { role: 'user', parts: [{ text: 'copied history' }] },
    ]);

    await createBtwAgentSession(parentContext);

    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockSetHistory).toHaveBeenCalledWith([
      { role: 'user', parts: [{ text: 'copied history' }] },
    ]);
  });

  it('fails the side session if the model attempts a tool call', async () => {
    mockSendMessageStream.mockReturnValue(
      (async function* () {
        yield {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'call-1',
            name: 'run_shell',
            args: {},
            isClientInitiated: false,
            prompt_id: 'btw-test',
          },
        };
      })(),
    );

    const session = await createBtwAgentSession(
      makeFakeConfig({}) as AgentLoopContext,
    );
    const events = await collectEvents(session);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'agent_start' }),
        expect.objectContaining({
          type: 'error',
          status: 'PERMISSION_DENIED',
          fatal: true,
        }),
        expect.objectContaining({ type: 'agent_end', reason: 'failed' }),
      ]),
    );
  });
});
