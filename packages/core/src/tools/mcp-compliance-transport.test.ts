/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { McpComplianceTransport } from './mcp-compliance-transport.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { EventEmitter } from 'node:events';

describe('McpComplianceTransport', () => {
  const createMockTransport = () => {
    const transport = new EventEmitter() as unknown as Transport &
      EventEmitter & {
        start: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
        send: ReturnType<typeof vi.fn>;
      };
    transport.start = vi.fn().mockResolvedValue(undefined);
    transport.close = vi.fn().mockResolvedValue(undefined);
    transport.send = vi.fn().mockResolvedValue(undefined);
    return transport;
  };

  it('should forward non-response messages without modification', async () => {
    const mockTransport = createMockTransport();
    const complianceTransport = new McpComplianceTransport(mockTransport);
    const onMessage = vi.fn();
    complianceTransport.onmessage = onMessage;

    const request: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    };

    mockTransport.onmessage!(request);
    expect(onMessage).toHaveBeenCalledWith(request);
  });

  it('should fix non-compliant tool results (JSON in content)', async () => {
    const mockTransport = createMockTransport();
    const complianceTransport = new McpComplianceTransport(mockTransport);
    const onMessage = vi.fn();
    complianceTransport.onmessage = onMessage;

    const rawResponse: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ foo: 'bar' }),
          },
        ],
      },
    };

    mockTransport.onmessage!(rawResponse);

    const fixedResponse = onMessage.mock.calls[0][0];
    expect(fixedResponse.result.structuredContent).toEqual({ foo: 'bar' });
    // Original content should still be there
    expect(fixedResponse.result.content[0].text).toBe(
      JSON.stringify({ foo: 'bar' }),
    );
  });

  it('should NOT modify already compliant responses', async () => {
    const mockTransport = createMockTransport();
    const complianceTransport = new McpComplianceTransport(mockTransport);
    const onMessage = vi.fn();
    complianceTransport.onmessage = onMessage;

    const compliantResponse: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [{ type: 'text', text: 'some display text' }],
        structuredContent: { foo: 'bar' },
      },
    };

    mockTransport.onmessage!(compliantResponse);
    expect(onMessage).toHaveBeenCalledWith(compliantResponse);
    expect(onMessage.mock.calls[0][0].result.structuredContent).toEqual({
      foo: 'bar',
    });
  });

  it('should NOT modify content that is not JSON', async () => {
    const mockTransport = createMockTransport();
    const complianceTransport = new McpComplianceTransport(mockTransport);
    const onMessage = vi.fn();
    complianceTransport.onmessage = onMessage;

    const textResponse: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [{ type: 'text', text: 'just some plain text, not JSON' }],
      },
    };

    mockTransport.onmessage!(textResponse);
    const result = onMessage.mock.calls[0][0].result;
    expect(result.structuredContent).toBeUndefined();
    expect(result.content[0].text).toBe('just some plain text, not JSON');
  });

  it('should handle empty content gracefully', async () => {
    const mockTransport = createMockTransport();
    const complianceTransport = new McpComplianceTransport(mockTransport);
    const onMessage = vi.fn();
    complianceTransport.onmessage = onMessage;

    const emptyResponse: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [],
      },
    };

    mockTransport.onmessage!(emptyResponse);
    expect(onMessage.mock.calls[0][0].result.structuredContent).toBeUndefined();
  });

  it('should only parse text content blocks', async () => {
    const mockTransport = createMockTransport();
    const complianceTransport = new McpComplianceTransport(mockTransport);
    const onMessage = vi.fn();
    complianceTransport.onmessage = onMessage;

    const mediaResponse: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [
          {
            type: 'image',
            data: 'base64data',
            mimeType: 'image/png',
          },
        ],
      },
    };

    mockTransport.onmessage!(mediaResponse);
    expect(onMessage.mock.calls[0][0].result.structuredContent).toBeUndefined();
  });

  it('should handle responses with multiple content blocks (only fixes the first one if it is text)', async () => {
    const mockTransport = createMockTransport();
    const complianceTransport = new McpComplianceTransport(mockTransport);
    const onMessage = vi.fn();
    complianceTransport.onmessage = onMessage;

    const multiResponse: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [
          { type: 'text', text: JSON.stringify({ first: true }) },
          { type: 'text', text: 'second item' },
        ],
      },
    };

    mockTransport.onmessage!(multiResponse);
    expect(onMessage.mock.calls[0][0].result.structuredContent).toEqual({
      first: true,
    });
  });

  it('should handle error responses gracefully', async () => {
    const mockTransport = createMockTransport();
    const complianceTransport = new McpComplianceTransport(mockTransport);
    const onMessage = vi.fn();
    complianceTransport.onmessage = onMessage;

    const errorResponse: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32000,
        message: 'Internal error',
      },
    };

    mockTransport.onmessage!(errorResponse);
    expect(onMessage).toHaveBeenCalledWith(errorResponse);
  });
});
