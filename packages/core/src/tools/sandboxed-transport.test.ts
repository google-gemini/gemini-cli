/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { SandboxedTransport } from './sandboxed-transport.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

describe('SandboxedTransport', () => {
  it('should call cleanup when the transport is closed via close()', async () => {
    const mockTransport: Transport = {
      close: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
    };

    const cleanup = vi.fn();
    const sandboxedTransport = new SandboxedTransport(mockTransport, cleanup);

    await sandboxedTransport.close();

    expect(mockTransport.close).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
  });

  it('should call cleanup when the underlying transport calls onclose', () => {
    const mockTransport: Transport = {
      close: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
    };
    const cleanup = vi.fn();
    const sandboxedTransport = new SandboxedTransport(mockTransport, cleanup);

    let oncloseCalled = false;
    sandboxedTransport.onclose = () => {
      oncloseCalled = true;
    };

    // Simulate underlying transport closing
    mockTransport.onclose?.();

    expect(cleanup).toHaveBeenCalled();
    expect(oncloseCalled).toBe(true);
  });

  it('should forward messages and errors', () => {
    const mockTransport: Transport = {
      close: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
    };
    const cleanup = vi.fn();
    const sandboxedTransport = new SandboxedTransport(mockTransport, cleanup);

    const receivedMessages: any[] = [];
    sandboxedTransport.onmessage = (msg) => receivedMessages.push(msg);

    const receivedErrors: Error[] = [];
    sandboxedTransport.onerror = (err) => receivedErrors.push(err);

    const testMessage = { jsonrpc: '2.0', method: 'test' } as any;
    mockTransport.onmessage?.(testMessage);

    const testError = new Error('test error');
    mockTransport.onerror?.(testError);

    expect(receivedMessages).toEqual([testMessage]);
    expect(receivedErrors).toEqual([testError]);
  });
});
