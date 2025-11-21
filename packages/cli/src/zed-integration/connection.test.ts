/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Connection, RequestError } from './connection.js';
import { ReadableStream, WritableStream } from 'node:stream/web';

describe('Connection', () => {
  let toPeer: WritableStream<Uint8Array>;
  let fromPeer: ReadableStream<Uint8Array>;
  let peerController: ReadableStreamDefaultController<Uint8Array>;
  let receivedChunks: string[] = [];
  let connection: Connection;
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    receivedChunks = [];
    toPeer = new WritableStream({
      write(chunk) {
        const str = new TextDecoder().decode(chunk);
        receivedChunks.push(str);
      },
    });

    fromPeer = new ReadableStream({
      start(controller) {
        peerController = controller;
      },
    });

    handler = vi.fn();
    connection = new Connection(handler, toPeer, fromPeer);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should send a request and receive a response', async () => {
    const responsePromise = connection.sendRequest('testMethod', {
      key: 'value',
    });

    // Verify request was sent
    await vi.waitFor(() => {
      expect(receivedChunks.length).toBeGreaterThan(0);
    });
    const request = JSON.parse(receivedChunks[0]);
    expect(request).toMatchObject({
      jsonrpc: '2.0',
      method: 'testMethod',
      params: { key: 'value' },
    });
    expect(request.id).toBeDefined();

    // Simulate response
    const response = {
      jsonrpc: '2.0',
      id: request.id,
      result: { success: true },
    };
    peerController.enqueue(
      new TextEncoder().encode(JSON.stringify(response) + '\n'),
    );

    const result = await responsePromise;
    expect(result).toEqual({ success: true });
  });

  it('should send a notification', async () => {
    await connection.sendNotification('notifyMethod', { key: 'value' });

    await vi.waitFor(() => {
      expect(receivedChunks.length).toBeGreaterThan(0);
    });
    const notification = JSON.parse(receivedChunks[0]);
    expect(notification).toMatchObject({
      jsonrpc: '2.0',
      method: 'notifyMethod',
      params: { key: 'value' },
    });
    expect(notification.id).toBeUndefined();
  });

  it('should handle incoming requests', async () => {
    handler.mockResolvedValue({ result: 'ok' });

    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'incomingMethod',
      params: { foo: 'bar' },
    };
    peerController.enqueue(
      new TextEncoder().encode(JSON.stringify(request) + '\n'),
    );

    // Wait for handler to be called and response to be written
    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith('incomingMethod', { foo: 'bar' });
      expect(receivedChunks.length).toBeGreaterThan(0);
    });

    const response = JSON.parse(receivedChunks[receivedChunks.length - 1]);
    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { result: 'ok' },
    });
  });

  it('should handle incoming notifications', async () => {
    const notification = {
      jsonrpc: '2.0',
      method: 'incomingNotify',
      params: { foo: 'bar' },
    };
    peerController.enqueue(
      new TextEncoder().encode(JSON.stringify(notification) + '\n'),
    );

    // Wait for handler to be called
    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith('incomingNotify', { foo: 'bar' });
    });
    // Notifications don't send responses
    expect(receivedChunks.length).toBe(0);
  });

  it('should handle request errors from handler', async () => {
    handler.mockRejectedValue(new Error('Handler failed'));

    const request = {
      jsonrpc: '2.0',
      id: 2,
      method: 'failMethod',
    };
    peerController.enqueue(
      new TextEncoder().encode(JSON.stringify(request) + '\n'),
    );

    await vi.waitFor(() => {
      expect(receivedChunks.length).toBeGreaterThan(0);
    });

    const response = JSON.parse(receivedChunks[receivedChunks.length - 1]);
    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 2,
      error: {
        code: -32603,
        message: 'Internal error',
        data: { details: 'Handler failed' },
      },
    });
  });

  it('should handle RequestError from handler', async () => {
    handler.mockRejectedValue(RequestError.methodNotFound('Unknown method'));

    const request = {
      jsonrpc: '2.0',
      id: 3,
      method: 'unknown',
    };
    peerController.enqueue(
      new TextEncoder().encode(JSON.stringify(request) + '\n'),
    );

    await vi.waitFor(() => {
      expect(receivedChunks.length).toBeGreaterThan(0);
    });

    const response = JSON.parse(receivedChunks[receivedChunks.length - 1]);
    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 3,
      error: {
        code: -32601,
        message: 'Method not found',
        data: { details: 'Unknown method' },
      },
    });
  });

  it('should handle response errors', async () => {
    const responsePromise = connection.sendRequest('testMethod');

    // Verify request was sent
    await vi.waitFor(() => {
      expect(receivedChunks.length).toBeGreaterThan(0);
    });
    const request = JSON.parse(receivedChunks[0]);

    // Simulate error response
    const response = {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32000,
        message: 'Custom error',
      },
    };
    peerController.enqueue(
      new TextEncoder().encode(JSON.stringify(response) + '\n'),
    );

    await expect(responsePromise).rejects.toMatchObject({
      code: -32000,
      message: 'Custom error',
    });
  });
});
