/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TransformStream,
  WritableStream,
  ReadableStream,
} from 'node:stream/web';
import {
  Agent,
  AgentSideConnection,
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
  LoadSessionRequest,
  LoadSessionResponse,
  AuthenticateRequest,
  PromptRequest,
  PromptResponse,
  CancelNotification,
  PROTOCOL_VERSION,
} from './acp.js';

describe('Connection', () => {
  let clientToAgent: TransformStream;
  let agentToClient: TransformStream;

  beforeEach(() => {
    clientToAgent = new TransformStream();
    agentToClient = new TransformStream();

    new AgentSideConnection(
      () => new StubAgent(),
      agentToClient.writable as WritableStream,
      clientToAgent.readable as ReadableStream<Uint8Array>,
    );
  });

  it('returns parse error for invalid JSON', async () => {
    const textEncoder = new TextEncoder();

    const writer = clientToAgent.writable.getWriter();
    await writer.write(textEncoder.encode('{\n'));
    writer.releaseLock();

    const message = await readMessage(agentToClient);
    expect(message).not.toBeNull();
    expect(message).toMatchObject({
      error: {
        code: -32700,
        data: {
          message: expect.stringContaining('}'),
        },
      },
    });
  });

  it('returns an invalid request error', async () => {
    await sendMessage(clientToAgent, {
      jsonrpc: '2.0',
    });

    const message = await readMessage(agentToClient);
    expect(message).not.toBeNull();
    expect(message).toMatchObject({
      error: {
        code: -32600,
      },
    });
  });

  it('handles arbitrary string errors', async () => {
    await sendMessage(clientToAgent, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      },
    });

    const message = await readMessage(agentToClient);
    expect(message).not.toBeNull();
    expect(message).toMatchObject({
      error: {
        code: -32603,
        data: {
          details: 'Failed to initialize',
        },
      },
    });
  });

  it('handles arbitrary JSON-encoded errors', async () => {
    await sendMessage(clientToAgent, {
      jsonrpc: '2.0',
      id: 1,
      method: 'session/new',
      params: {
        cwd: '/',
        mcpServers: [],
      },
    });

    const message = await readMessage(agentToClient);
    expect(message).not.toBeNull();
    expect(message).toMatchObject({
      error: {
        code: -32603,
        data: {
          json: true,
        },
      },
    });
  });
});

class StubAgent implements Agent {
  async initialize(_: InitializeRequest): Promise<InitializeResponse> {
    throw new Error('Failed to initialize');
  }
  async newSession(_: NewSessionRequest): Promise<NewSessionResponse> {
    throw new Error('{ "json": true }');
  }
  async loadSession(_: LoadSessionRequest): Promise<LoadSessionResponse> {
    throw new Error('Unimplemented');
  }
  async authenticate(_: AuthenticateRequest): Promise<void> {
    throw new Error('Unimplemented');
  }
  async prompt(_: PromptRequest): Promise<PromptResponse> {
    throw new Error('Unimplemented');
  }
  async cancel(_: CancelNotification): Promise<void> {
    throw new Error('Unimplemented');
  }
}

async function sendMessage(
  clientToAgent: TransformStream,
  message: object,
): Promise<void> {
  const textEncoder = new TextEncoder();
  const writer = clientToAgent.writable.getWriter();
  await writer.write(textEncoder.encode(JSON.stringify(message) + '\n'));
  writer.releaseLock();
}

async function readMessage(
  agentToClient: TransformStream,
): Promise<unknown | undefined> {
  let content = '';
  const decoder = new TextDecoder();
  for await (const chunk of agentToClient.readable as ReadableStream<Uint8Array>) {
    content += decoder.decode(chunk, { stream: true });
    const lines = content.split('\n');
    content = lines.pop() || '';

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine) {
        return JSON.parse(trimmedLine);
      }
    }
  }

  return undefined;
}
