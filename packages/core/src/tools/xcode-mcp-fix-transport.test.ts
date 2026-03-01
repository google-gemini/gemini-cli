/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { XcodeMcpBridgeFixTransport } from './xcode-mcp-fix-transport.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

// Mock Transport that simulates the mcpbridge behavior
class MockBadMcpBridgeTransport extends EventEmitter implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  async start() {}
  async close() {}
  async send(_message: JSONRPCMessage) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emitMessage(msg: any) {
    this.onmessage?.(msg);
  }
}

describe('Xcode MCP Bridge Fix', () => {
  it('intercepts and fixes the non-compliant mcpbridge response', async () => {
    const mockTransport = new MockBadMcpBridgeTransport();
    const fixTransport = new XcodeMcpBridgeFixTransport(mockTransport);

    // We need to capture what the fixTransport emits to its listeners
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [];
    fixTransport.onmessage = (msg) => {
      messages.push(msg);
    };

    await fixTransport.start();

    // SCENARIO 1: Bad response from Xcode
    // It has `content` stringified JSON, but misses `structuredContent`
    const badPayload = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              windows: [{ title: 'HelloWorld', path: '/path/to/project' }],
            }),
          },
        ],
        // Missing: structuredContent
      },
    };

    mockTransport.emitMessage(badPayload);

    // Verify the message received by the client (listener of fixTransport)
    const fixedMsg = messages.find((m) => m.id === 1);
    expect(fixedMsg).toBeDefined();
    expect(fixedMsg.result.structuredContent).toBeDefined();
    expect(fixedMsg.result.structuredContent.windows[0].title).toBe(
      'HelloWorld',
    );

    // SCENARIO 2: Good response (should be untouched)
    const goodPayload = {
      jsonrpc: '2.0',
      id: 2,
      result: {
        content: [{ type: 'text', text: 'normal text' }],
        structuredContent: { some: 'data' },
      },
    };
    mockTransport.emitMessage(goodPayload);

    const goodMsg = messages.find((m) => m.id === 2);
    expect(goodMsg).toBeDefined();
    expect(goodMsg.result.structuredContent).toEqual({ some: 'data' });
  });

  it('ignores responses that cannot be parsed as JSON', async () => {
    const mockTransport = new MockBadMcpBridgeTransport();
    const fixTransport = new XcodeMcpBridgeFixTransport(mockTransport);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [];
    fixTransport.onmessage = (msg) => {
      messages.push(msg);
    };

    await fixTransport.start();

    const nonJsonPayload = {
      jsonrpc: '2.0',
      id: 3,
      result: {
        content: [
          {
            type: 'text',
            text: "Just some plain text that isn't JSON",
          },
        ],
      },
    };

    mockTransport.emitMessage(nonJsonPayload);

    const msg = messages.find((m) => m.id === 3);
    expect(msg).toBeDefined();
    expect(msg.result.structuredContent).toBeUndefined();
    expect(msg.result.content[0].text).toBe(
      "Just some plain text that isn't JSON",
    );
  });
});
