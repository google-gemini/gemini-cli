/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  captureHeapSnapshot,
  MEMORY_SNAPSHOT_AUTO_THRESHOLD_BYTES,
} from './memorySnapshot.js';

type StreamWrites = string[];

interface FakeSession {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
}

const { sessionInstances, createdStreams, mkdirMock, postFailure } = vi.hoisted(
  () => ({
    sessionInstances: [] as FakeSession[],
    createdStreams: [] as Array<
      EventEmitter & {
        write: ReturnType<typeof vi.fn>;
        end: ReturnType<typeof vi.fn>;
        writes: StreamWrites;
        path: string;
      }
    >,
    mkdirMock: vi.fn(async () => undefined),
    postFailure: { error: null as Error | null },
  }),
);

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    mkdir: mkdirMock,
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    createWriteStream: vi.fn((filePath: string) => {
      const writes: StreamWrites = [];
      const emitter = new EventEmitter() as EventEmitter & {
        write: ReturnType<typeof vi.fn>;
        end: ReturnType<typeof vi.fn>;
        writes: StreamWrites;
        path: string;
      };
      emitter.writes = writes;
      emitter.path = filePath;
      emitter.write = vi.fn((chunk: string) => {
        writes.push(chunk);
        return true;
      });
      emitter.end = vi.fn(() => {
        // Defer 'finish' so awaiters see it after the current microtask.
        queueMicrotask(() => emitter.emit('finish'));
      });
      createdStreams.push(emitter);
      return emitter;
    }),
  };
});

vi.mock('node:inspector/promises', () => {
  class Session {
    private listeners = new Map<string, Set<(msg: unknown) => void>>();
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;

    constructor() {
      this.connect = vi.fn();
      this.disconnect = vi.fn();
      this.on = vi.fn((event: string, listener: (msg: unknown) => void) => {
        if (!this.listeners.has(event)) {
          this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(listener);
        return this;
      });
      this.removeListener = vi.fn(
        (event: string, listener: (msg: unknown) => void) => {
          this.listeners.get(event)?.delete(listener);
          return this;
        },
      );
      this.post = vi.fn(async (method: string) => {
        if (postFailure.error) {
          throw postFailure.error;
        }
        if (method === 'HeapProfiler.takeHeapSnapshot') {
          const handlers = this.listeners.get(
            'HeapProfiler.addHeapSnapshotChunk',
          );
          handlers?.forEach((fn) => {
            fn({ params: { chunk: 'chunk-a' } });
            fn({ params: { chunk: 'chunk-b' } });
          });
        }
      });
      sessionInstances.push(this as unknown as FakeSession);
    }
  }
  return { Session };
});

describe('captureHeapSnapshot', () => {
  beforeEach(() => {
    sessionInstances.length = 0;
    createdStreams.length = 0;
    mkdirMock.mockClear();
    postFailure.error = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exports the 2 GB auto-capture threshold', () => {
    expect(MEMORY_SNAPSHOT_AUTO_THRESHOLD_BYTES).toBe(2 * 1024 * 1024 * 1024);
  });

  it('connects the inspector, streams chunks to disk, removes the listener, and disconnects', async () => {
    const target = '/tmp/gemini-test/snapshot.heapsnapshot';

    await captureHeapSnapshot(target);

    expect(mkdirMock).toHaveBeenCalledWith('/tmp/gemini-test', {
      recursive: true,
    });

    expect(sessionInstances).toHaveLength(1);
    const session = sessionInstances[0];
    expect(session.connect).toHaveBeenCalledTimes(1);
    expect(session.on).toHaveBeenCalledWith(
      'HeapProfiler.addHeapSnapshotChunk',
      expect.any(Function),
    );
    expect(session.post).toHaveBeenCalledWith('HeapProfiler.takeHeapSnapshot', {
      reportProgress: false,
    });
    expect(session.removeListener).toHaveBeenCalledWith(
      'HeapProfiler.addHeapSnapshotChunk',
      expect.any(Function),
    );
    expect(session.disconnect).toHaveBeenCalledTimes(1);

    expect(createdStreams).toHaveLength(1);
    const stream = createdStreams[0];
    expect(stream.path).toBe(target);
    expect(stream.writes).toEqual(['chunk-a', 'chunk-b']);
    expect(stream.end).toHaveBeenCalledTimes(1);
  });

  it('disconnects the inspector even when HeapProfiler.takeHeapSnapshot fails', async () => {
    postFailure.error = new Error('heap profiler disabled');

    await expect(
      captureHeapSnapshot('/tmp/gemini-test/fail.heapsnapshot'),
    ).rejects.toThrow('heap profiler disabled');

    expect(sessionInstances).toHaveLength(1);
    expect(sessionInstances[0].disconnect).toHaveBeenCalledTimes(1);
  });
});
