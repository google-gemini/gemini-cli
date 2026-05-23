/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import * as acp from '@agentclientprotocol/sdk';
import { createAcpStream } from './acpStdioTransport.js';

describe('ACP stdio transport', () => {
  it('normalizes string initialize protocolVersion values before SDK validation', async () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let inputController!: ReadableStreamDefaultController<Uint8Array>;
    let output = '';

    const input = new ReadableStream<Uint8Array>({
      start(controller) {
        inputController = controller;
      },
    });
    const writable = new WritableStream<Uint8Array>({
      write(chunk) {
        output += decoder.decode(chunk, { stream: true });
      },
    });
    const stream = createAcpStream(writable, input);

    const initialize = vi.fn(async () => ({
      protocolVersion: acp.PROTOCOL_VERSION,
      agentCapabilities: { loadSession: false },
      authMethods: [],
    }));
    const unexpectedRequest = async () => {
      throw new Error('unexpected ACP request');
    };
    const agent: acp.Agent = {
      initialize,
      newSession: unexpectedRequest,
      authenticate: async () => {},
      prompt: unexpectedRequest,
      cancel: async () => {},
    };
    const connection = new acp.AgentSideConnection(() => agent, stream);

    inputController.enqueue(
      encoder.encode(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        })}\n`,
      ),
    );

    await vi.waitFor(() => expect(initialize).toHaveBeenCalledTimes(1));
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ protocolVersion: acp.PROTOCOL_VERSION }),
    );
    await vi.waitFor(() => expect(output).toContain('"result"'));
    expect(output).toContain('"protocolVersion":1');

    inputController.close();
    await connection.closed;
  });
});
