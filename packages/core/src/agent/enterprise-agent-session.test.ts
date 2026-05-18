/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { EnterpriseAgentSession } from './enterprise-agent-session.js';
import type { Config } from '../config/config.js';
import type { AgentEvent } from './types.js';
import { GoogleAuth } from 'google-auth-library';

// Mock google-auth-library
vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(),
}));

describe('EnterpriseAgentSession', () => {
  let mockConfig: Config;
  let globalFetch: typeof fetch;

  beforeEach(() => {
    vi.clearAllMocks();

    (GoogleAuth as unknown as Mock).mockImplementation(() => ({
      getClient: vi.fn().mockResolvedValue({
        getAccessToken: vi.fn().mockResolvedValue({ token: 'fake-token' }),
      }),
    }));

    mockConfig = {
      getSessionId: vi.fn().mockReturnValue('test-session'),
      getEnterpriseConfig: vi.fn().mockReturnValue({
        projectId: 'test-project',
        engineId: 'test-engine',
        location: 'global',
      }),
    } as unknown as Config;

    globalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = globalFetch;
    vi.restoreAllMocks();
  });

  const mockFetchResponse = (chunks: string[]) => {
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
      headers: new Headers(),
    } as Response);
  };

  it('should successfully call Enterprise API and stream responses', async () => {
    const chunk1 = JSON.stringify({
      sessionInfo: { session: 'projects/test-project/locations/global/collections/default_collection/engines/test-engine/sessions/s1' },
      answer: {
        replies: [
          {
            groundedContent: {
              content: { text: 'Hello' },
            },
          },
        ],
      },
    }) + '\n';

    const chunk2 = JSON.stringify({
      answer: {
        replies: [
          {
            groundedContent: {
              content: { text: ' World' },
            },
          },
        ],
      },
    }) + '\n';

    mockFetchResponse([chunk1, chunk2]);

    const session = new EnterpriseAgentSession({ config: mockConfig });
    const { streamId } = await session.send({
      message: { content: [{ type: 'text', text: 'hi' }] },
    });

    expect(streamId).toBe('enterprise-stream-1');

    const events: AgentEvent[] = [];
    for await (const event of session.stream({ streamId: streamId! })) {
      events.push(event);
    }

    expect(events.map(e => e.type)).toEqual([
      'agent_start',
      'message', // Hello
      'message', // World
      'agent_end',
    ]);

    const messages = events.filter((e): e is AgentEvent<'message'> => e.type === 'message' && e.role === 'agent');
    expect(messages[0].content).toEqual([{ type: 'text', text: 'Hello' }]);
    expect(messages[1].content).toEqual([{ type: 'text', text: ' World' }]);
  });

  it('should handle thoughts', async () => {
    const chunk = JSON.stringify({
      answer: {
        replies: [
          {
            groundedContent: {
              content: { text: 'Thinking...', thought: true },
            },
          },
          {
            groundedContent: {
              content: { text: 'Final answer' },
            },
          },
        ],
      },
    }) + '\n';

    mockFetchResponse([chunk]);

    const session = new EnterpriseAgentSession({ config: mockConfig });
    const { streamId } = await session.send({
      message: { content: [{ type: 'text', text: 'hi' }] },
    });

    const events: AgentEvent[] = [];
    for await (const event of session.stream({ streamId: streamId! })) {
      events.push(event);
    }



    const thoughts = events.filter((e): e is AgentEvent<'message'> => e.type === 'message' && e.content[0]?.type === 'thought');
    expect(thoughts).toHaveLength(1);
    expect(thoughts[0].content).toEqual([{ type: 'thought', thought: 'Thinking...' }]);

    const texts = events.filter((e): e is AgentEvent<'message'> => e.type === 'message' && e.content[0]?.type === 'text' && e.role === 'agent');
    expect(texts).toHaveLength(1);
    expect(texts[0].content).toEqual([{ type: 'text', text: 'Final answer' }]);
  });

  it('should handle tool requests and responses (executable code)', async () => {
    const chunk1 = JSON.stringify({
      answer: {
        replies: [
          {
            groundedContent: {
              content: {
                executableCode: { code: 'print("hello")' },
              },
            },
          },
        ],
      },
    }) + '\n';

    const chunk2 = JSON.stringify({
      answer: {
        replies: [
          {
            groundedContent: {
              content: {
                codeExecutionResult: { outcome: 'OUTCOME_OK', output: 'hello\n' },
              },
            },
          },
        ],
      },
    }) + '\n';

    mockFetchResponse([chunk1, chunk2]);

    const session = new EnterpriseAgentSession({ config: mockConfig });
    const { streamId } = await session.send({
      message: { content: [{ type: 'text', text: 'run code' }] },
    });

    const events: AgentEvent[] = [];
    for await (const event of session.stream({ streamId: streamId! })) {
      events.push(event);
    }



    expect(events.map(e => e.type)).toEqual([
      'agent_start',
      'tool_request',
      'tool_response',
      'agent_end',
    ]);

    const toolReq = events.find(e => e.type === 'tool_request') as AgentEvent<'tool_request'>;
    expect(toolReq.name).toBe('python_interpreter');
    expect(toolReq.args).toEqual({ code: 'print("hello")' });

    const toolResp = events.find(e => e.type === 'tool_response') as AgentEvent<'tool_response'>;
    expect(toolResp.name).toBe('python_interpreter');
    expect(toolResp.content).toEqual([{ type: 'text', text: 'hello\n' }]);
    expect(toolResp.isError).toBe(false);
  });

  it('should handle immersive artifacts (tables/docs)', async () => {
    const chunk = JSON.stringify({
      answer: {
        replies: [
          {
            groundedContent: {
              content: { text: 'Here is the table:\n' },
            },
            immersiveArtifact: [
              {
                docArtifact: { text: '| Col 1 | Col 2 |\n|---|---|\n| Val 1 | Val 2 |' },
              },
            ],
          },
        ],
      },
    }) + '\n';

    mockFetchResponse([chunk]);

    const session = new EnterpriseAgentSession({ config: mockConfig });
    const { streamId } = await session.send({
      message: { content: [{ type: 'text', text: 'show table' }] },
    });

    const events: AgentEvent[] = [];
    for await (const event of session.stream({ streamId: streamId! })) {
      events.push(event);
    }

    const texts = events.filter((e): e is AgentEvent<'message'> => e.type === 'message' && e.role === 'agent');
    expect(texts).toHaveLength(2);
    expect(texts[0].content).toEqual([{ type: 'text', text: 'Here is the table:\n' }]);
    expect(texts[1].content).toEqual([{ type: 'text', text: '| Col 1 | Col 2 |\n|---|---|\n| Val 1 | Val 2 |' }]);
  });
});
