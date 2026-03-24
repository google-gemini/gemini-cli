/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DapClient } from './dap-client.js';

/**
 * Helper: craft a DAP wire‐protocol message (Content-Length header + JSON body).
 */
function wireMessage(obj: object): Buffer {
  const json = JSON.stringify(obj);
  const header = `Content-Length: ${Buffer.byteLength(json, 'utf-8')}\r\n\r\n`;
  return Buffer.from(header + json);
}

describe('DapClient', () => {
  let client: DapClient;

  beforeEach(() => {
    client = new DapClient({ requestTimeoutMs: 2000 });
  });

  afterEach(async () => {
    if (client.isConnected()) {
      await client.disconnect();
    }
  });

  describe('connection state', () => {
    it('starts disconnected', () => {
      expect(client.isConnected()).toBe(false);
    });

    it('rejects requests when not connected', async () => {
      await expect(client.sendRequest('stackTrace')).rejects.toThrow(
        /not connected/i,
      );
    });

    it('rejects duplicate stdio connections', () => {
      // Minimal mock child process
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.connectStdio(mockProc as any);
      expect(client.isConnected()).toBe(true);

      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client.connectStdio(mockProc as any);
      }).toThrow(/already connected/i);
    });
  });

  describe('message framing', () => {
    it('parses a complete DAP response from a single data chunk', async () => {
      const stdinWrite = vi.fn();
      const stdoutListeners: Array<(data: Buffer) => void> = [];

      const mockProc = {
        stdout: {
          on: (event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') stdoutListeners.push(cb);
          },
        },
        stderr: { on: vi.fn() },
        stdin: { write: stdinWrite },
        on: vi.fn(),
        kill: vi.fn(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.connectStdio(mockProc as any);

      // Send a request — this writes to stdin
      const promise = client.sendRequest<{ result: string }>('evaluate', {
        expression: '1+1',
      });

      // Simulate adapter response arriving on stdout
      const responseMsg = wireMessage({
        seq: 100,
        type: 'response',
        request_seq: 1,
        success: true,
        command: 'evaluate',
        body: { result: '2' },
      });

      for (const listener of stdoutListeners) {
        listener(responseMsg);
      }

      const result = await promise;
      expect(result).toEqual({ result: '2' });
    });

    it('handles chunked messages split across multiple data events', async () => {
      const stdoutListeners: Array<(data: Buffer) => void> = [];

      const mockProc = {
        stdout: {
          on: (event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') stdoutListeners.push(cb);
          },
        },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.connectStdio(mockProc as any);

      const promise = client.sendRequest<{ value: number }>('test');

      const fullMsg = wireMessage({
        seq: 50,
        type: 'response',
        request_seq: 1,
        success: true,
        command: 'test',
        body: { value: 42 },
      });

      // Split the message at an arbitrary point
      const mid = Math.floor(fullMsg.length / 2);
      const chunk1 = fullMsg.subarray(0, mid);
      const chunk2 = fullMsg.subarray(mid);

      for (const listener of stdoutListeners) {
        listener(chunk1);
      }
      // Result should not be ready yet
      // Now send the rest
      for (const listener of stdoutListeners) {
        listener(chunk2);
      }

      const result = await promise;
      expect(result).toEqual({ value: 42 });
    });

    it('handles multiple messages in a single data chunk', async () => {
      const stdoutListeners: Array<(data: Buffer) => void> = [];

      const mockProc = {
        stdout: {
          on: (event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') stdoutListeners.push(cb);
          },
        },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.connectStdio(mockProc as any);

      const promise1 = client.sendRequest<{ a: number }>('req1');
      const promise2 = client.sendRequest<{ b: number }>('req2');

      // Two responses packed into one buffer
      const resp1 = wireMessage({
        seq: 10,
        type: 'response',
        request_seq: 1,
        success: true,
        command: 'req1',
        body: { a: 1 },
      });
      const resp2 = wireMessage({
        seq: 11,
        type: 'response',
        request_seq: 2,
        success: true,
        command: 'req2',
        body: { b: 2 },
      });

      const combined = Buffer.concat([resp1, resp2]);
      for (const listener of stdoutListeners) {
        listener(combined);
      }

      expect(await promise1).toEqual({ a: 1 });
      expect(await promise2).toEqual({ b: 2 });
    });
  });

  describe('error handling', () => {
    it('rejects with error message on unsuccessful response', async () => {
      const stdoutListeners: Array<(data: Buffer) => void> = [];

      const mockProc = {
        stdout: {
          on: (event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') stdoutListeners.push(cb);
          },
        },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.connectStdio(mockProc as any);

      const promise = client.sendRequest('badCommand');

      const errResponse = wireMessage({
        seq: 5,
        type: 'response',
        request_seq: 1,
        success: false,
        command: 'badCommand',
        message: 'Unknown command: badCommand',
      });

      for (const listener of stdoutListeners) {
        listener(errResponse);
      }

      await expect(promise).rejects.toThrow('Unknown command: badCommand');
    });

    it('times out if no response is received', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.connectStdio(mockProc as any);

      // Client was created with 2000ms timeout
      await expect(client.sendRequest('slowCommand')).rejects.toThrow(
        /timed out/i,
      );
    }, 5000);
  });

  describe('events', () => {
    it('emits DAP events received from the adapter', async () => {
      const stdoutListeners: Array<(data: Buffer) => void> = [];

      const mockProc = {
        stdout: {
          on: (event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') stdoutListeners.push(cb);
          },
        },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.connectStdio(mockProc as any);

      const stoppedHandler = vi.fn();
      client.on('event:stopped', stoppedHandler);

      const stoppedEvent = wireMessage({
        seq: 1,
        type: 'event',
        event: 'stopped',
        body: {
          reason: 'breakpoint',
          threadId: 1,
          allThreadsStopped: true,
        },
      });

      for (const listener of stdoutListeners) {
        listener(stoppedEvent);
      }

      expect(stoppedHandler).toHaveBeenCalledWith({
        reason: 'breakpoint',
        threadId: 1,
        allThreadsStopped: true,
      });
    });
  });

  describe('disconnect', () => {
    it('rejects pending requests on disconnect', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.connectStdio(mockProc as any);

      const promise = client.sendRequest('willBeRejected');
      await client.disconnect();

      await expect(promise).rejects.toThrow(/disconnect/i);
      expect(client.isConnected()).toBe(false);
    });
  });
});
