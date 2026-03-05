/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendV1MessageStream } from './v1-bridge.js';
import { EventEmitter } from 'node:events';

// Global mock state to share between mock factory and tests
const mockCall = new EventEmitter() as unknown as EventEmitter & {
  cancel: import('vitest').Mock;
};
mockCall.cancel = vi.fn();

const mockService = {
  SendStreamingMessage: vi.fn(() => mockCall),
};

// Mock gRPC and Proto Loader
vi.mock('@grpc/grpc-js', () => ({
  loadPackageDefinition: vi.fn().mockReturnValue({
    lf: {
      a2a: {
        v1: {
          A2AService: vi.fn().mockImplementation(() => mockService),
        },
      },
    },
  }),
  credentials: {
    createInsecure: vi.fn(),
    createSsl: vi.fn(),
  },
}));

vi.mock('@grpc/proto-loader', () => ({
  fromJSON: vi.fn().mockReturnValue({}),
}));

describe('v1-bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCall.removeAllListeners();
  });

  it('should correctly map a string query to a V1 Part.text request', async () => {
    const stream = sendV1MessageStream('http://localhost:9000', 'hello agent');

    // Start the generator
    const it = stream[Symbol.asyncIterator]();
    const nextPromise = it.next();

    // Verify the request sent to gRPC
    expect(mockService.SendStreamingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          parts: [
            expect.objectContaining({
              text: 'hello agent',
            }),
          ],
        }),
      }),
    );

    // Cleanup
    mockCall.emit('end');
    await nextPromise;
  });

  it('should transform a V1 Message response into an SDK Message result', async () => {
    const stream = sendV1MessageStream('http://localhost:9000', 'hi');
    const results: unknown[] = [];

    // Simulate gRPC data arrival
    const processStream = (async () => {
      for await (const chunk of stream) {
        results.push(chunk);
      }
    })();

    // Ensure listeners are attached before emitting
    await new Promise((resolve) => setTimeout(resolve, 0));

    mockCall.emit('data', {
      message: {
        messageId: 'v1-id',
        role: 1, // USER
        parts: [{ text: 'Response from V1' }],
      },
    });

    mockCall.emit('end');
    await processStream;

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      expect.objectContaining({
        kind: 'message',
        messageId: 'v1-id',
        parts: [{ kind: 'text', text: 'Response from V1' }],
      }),
    );
  });

  it('should transform a V1 StatusUpdate response (without message) into an SDK StatusUpdate', async () => {
    const stream = sendV1MessageStream('http://localhost:9000', 'hi');
    const results: unknown[] = [];

    const processStream = (async () => {
      for await (const chunk of stream) {
        results.push(chunk);
      }
    })();

    // Ensure listeners are attached
    await new Promise((resolve) => setTimeout(resolve, 0));

    // V1 Structure for status update without a nested message string
    mockCall.emit('data', {
      statusUpdate: {
        status: {
          state: 3, // WORKING
        },
      },
    });

    mockCall.emit('end');
    await processStream;

    expect(results).toHaveLength(1);
    const firstResult = results[0] as Record<string, unknown>;
    expect(firstResult['kind']).toBe('status-update');
    // Verify mapping from 3 -> 'working'
    const status = firstResult['status'] as Record<string, unknown>;
    expect(status['state']).toBe('working');
  });

  it('should propagate gRPC stream errors', async () => {
    const stream = sendV1MessageStream('http://localhost:9000', 'hi');

    const processStream = (async () => {
      for await (const _ of stream) {
        // empty
      }
    })();

    // Ensure listeners are attached
    await new Promise((resolve) => setTimeout(resolve, 0));

    mockCall.emit('error', new Error('gRPC internal error'));

    await expect(processStream).rejects.toThrow('gRPC internal error');
  });
});
