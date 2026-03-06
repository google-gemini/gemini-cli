/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DapClient } from './DapClient.js';
import type { DapEvent, DapMessage, DapTransport } from './types.js';

class FakeDapTransport implements DapTransport {
  private dataHandler: (chunk: string) => void = () => {};
  private exitHandler: (code: number | null, signal: string | null) => void =
    () => {};
  private sentPayloads: string[] = [];
  private started = false;

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  async send(payload: string): Promise<void> {
    if (!this.started) {
      throw new Error('not started');
    }
    this.sentPayloads.push(payload);
  }

  onData(handler: (chunk: string) => void): void {
    this.dataHandler = handler;
  }

  onExit(handler: (code: number | null, signal: string | null) => void): void {
    this.exitHandler = handler;
  }

  emitMessage(message: DapMessage): void {
    this.dataHandler(encodeMessage(message));
  }

  emitExit(code: number | null, signal: string | null): void {
    this.exitHandler(code, signal);
  }

  getLastSentMessage(): DapMessage {
    const rawPayload = this.sentPayloads.at(-1);
    if (!rawPayload) {
      throw new Error('No payload sent.');
    }
    return decodeMessage(rawPayload);
  }
}

describe('DapClient', () => {
  let transport: FakeDapTransport;
  let client: DapClient;

  beforeEach(async () => {
    transport = new FakeDapTransport();
    client = new DapClient(transport);
    await client.start();
  });

  it('sends initialize request and resolves with response body', async () => {
    const responsePromise = client.sendRequest('initialize', {
      adapterID: 'node',
    });

    const request = transport.getLastSentMessage();
    expect(request.type).toBe('request');
    expect(request.command).toBe('initialize');
    expect(request.arguments).toEqual({ adapterID: 'node' });

    transport.emitMessage({
      seq: 100,
      type: 'response',
      request_seq: request.seq,
      success: true,
      command: 'initialize',
      body: { supportsRestartRequest: true },
    });

    await expect(responsePromise).resolves.toEqual({
      supportsRestartRequest: true,
    });
  });

  it('dispatches event notifications to subscribed handlers', async () => {
    const onStopped = vi.fn<(event: DapEvent) => void>();
    client.onNotification('stopped', onStopped);

    transport.emitMessage({
      seq: 2,
      type: 'event',
      event: 'stopped',
      body: { reason: 'breakpoint' },
    });

    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(onStopped).toHaveBeenCalledWith({
      seq: 2,
      type: 'event',
      event: 'stopped',
      body: { reason: 'breakpoint' },
    });
  });

  it('rejects pending requests when transport exits', async () => {
    const responsePromise = client.sendRequest('threads');

    transport.emitExit(1, null);

    await expect(responsePromise).rejects.toThrow(
      'DAP transport exited (code=1, signal=null).',
    );
  });
});

function encodeMessage(message: DapMessage): string {
  const payload = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`;
}

function decodeMessage(payload: string): DapMessage {
  const delimiter = '\r\n\r\n';
  const delimiterIndex = payload.indexOf(delimiter);
  if (delimiterIndex === -1) {
    throw new Error('Invalid framed message.');
  }
  const json = payload.slice(delimiterIndex + delimiter.length);
  return JSON.parse(json) as DapMessage;
}
