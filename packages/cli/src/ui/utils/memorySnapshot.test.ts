/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';
import {
  captureHeapSnapshot,
  MEMORY_SNAPSHOT_AUTO_THRESHOLD_BYTES,
} from './memorySnapshot.js';

const { mkdirMock, pipelineMock, getHeapSnapshotMock, createWriteStreamMock } =
  vi.hoisted(() => ({
    mkdirMock: vi.fn(async () => undefined),
    pipelineMock: vi.fn(async () => undefined),
    getHeapSnapshotMock: vi.fn(),
    createWriteStreamMock: vi.fn(),
  }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, mkdir: mkdirMock };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, createWriteStream: createWriteStreamMock };
});

vi.mock('node:v8', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:v8')>();
  return { ...actual, getHeapSnapshot: getHeapSnapshotMock };
});

vi.mock('node:stream/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:stream/promises')>();
  return { ...actual, pipeline: pipelineMock };
});

describe('captureHeapSnapshot', () => {
  beforeEach(() => {
    mkdirMock.mockClear();
    pipelineMock.mockClear();
    getHeapSnapshotMock.mockClear().mockReturnValue(Readable.from([]));
    createWriteStreamMock
      .mockClear()
      .mockReturnValue({ write: vi.fn(), end: vi.fn() });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exports the 2 GB auto-capture threshold', () => {
    expect(MEMORY_SNAPSHOT_AUTO_THRESHOLD_BYTES).toBe(2 * 1024 * 1024 * 1024);
  });

  it('creates the target directory and pipelines the V8 snapshot to disk', async () => {
    const target = '/tmp/gemini-test/snapshot.heapsnapshot';

    await captureHeapSnapshot(target);

    expect(mkdirMock).toHaveBeenCalledWith('/tmp/gemini-test', {
      recursive: true,
    });
    expect(getHeapSnapshotMock).toHaveBeenCalledTimes(1);
    expect(createWriteStreamMock).toHaveBeenCalledWith(target);
    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(pipelineMock).toHaveBeenCalledWith(
      getHeapSnapshotMock.mock.results[0].value,
      createWriteStreamMock.mock.results[0].value,
    );
  });

  it('propagates pipeline failures to the caller', async () => {
    pipelineMock.mockRejectedValueOnce(new Error('write failed'));

    await expect(
      captureHeapSnapshot('/tmp/gemini-test/fail.heapsnapshot'),
    ).rejects.toThrow('write failed');
  });
});
