/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { bugMemoryCommand } from './bugMemoryCommand.js';
import { captureHeapSnapshot } from '../utils/memorySnapshot.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import type { Config } from '@google/gemini-cli-core';

vi.mock('../utils/memorySnapshot.js', () => ({
  captureHeapSnapshot: vi.fn(),
  MEMORY_SNAPSHOT_AUTO_THRESHOLD_BYTES: 2 * 1024 * 1024 * 1024,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    stat: vi.fn().mockResolvedValue({ size: 1234 }),
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: {
      error: vi.fn(),
      log: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    },
  };
});

function makeContextWithTempDir(tempDir: string | undefined) {
  return createMockCommandContext({
    services: {
      agentContext: {
        config: {
          storage: tempDir ? { getProjectTempDir: () => tempDir } : undefined,
        } as unknown as Config,
      },
    },
  });
}

describe('bugMemoryCommand', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('declares itself as a non-auto-executing built-in command', () => {
    expect(bugMemoryCommand.name).toBe('bug-memory');
    expect(bugMemoryCommand.autoExecute).toBe(false);
    expect(bugMemoryCommand.description).toBeTruthy();
  });

  it('captures a heap snapshot and reports the file path', async () => {
    const tempDir = path.join('/tmp', 'gemini-test');
    const context = makeContextWithTempDir(tempDir);
    vi.mocked(captureHeapSnapshot).mockResolvedValueOnce(undefined);

    if (!bugMemoryCommand.action) throw new Error('Action missing');
    await bugMemoryCommand.action(context, '');

    const expectedPath = path.join(
      tempDir,
      `bug-memory-${new Date('2024-01-01T00:00:00Z').getTime()}.heapsnapshot`,
    );
    expect(captureHeapSnapshot).toHaveBeenCalledWith(expectedPath);

    const addItemCalls = vi.mocked(context.ui.addItem).mock.calls;
    expect(addItemCalls).toHaveLength(2);
    expect(addItemCalls[0][0]).toMatchObject({ type: MessageType.INFO });
    expect(addItemCalls[0][0].text).toContain(expectedPath);
    expect(addItemCalls[1][0]).toMatchObject({ type: MessageType.INFO });
    expect(addItemCalls[1][0].text).toContain('Heap snapshot saved');
    expect(addItemCalls[1][0].text).toContain(expectedPath);
  });

  it('surfaces an error if capture fails', async () => {
    const context = makeContextWithTempDir('/tmp/gemini-test');
    vi.mocked(captureHeapSnapshot).mockRejectedValueOnce(
      new Error('inspector disconnected'),
    );

    if (!bugMemoryCommand.action) throw new Error('Action missing');
    await bugMemoryCommand.action(context, '');

    const addItemCalls = vi.mocked(context.ui.addItem).mock.calls;
    const lastCall = addItemCalls[addItemCalls.length - 1][0];
    expect(lastCall.type).toBe(MessageType.ERROR);
    expect(lastCall.text).toContain('inspector disconnected');
  });

  it('emits an error when no project temp directory is available', async () => {
    const context = makeContextWithTempDir(undefined);

    if (!bugMemoryCommand.action) throw new Error('Action missing');
    await bugMemoryCommand.action(context, '');

    expect(captureHeapSnapshot).not.toHaveBeenCalled();
    const addItemCalls = vi.mocked(context.ui.addItem).mock.calls;
    expect(addItemCalls).toHaveLength(1);
    expect(addItemCalls[0][0].type).toBe(MessageType.ERROR);
    expect(addItemCalls[0][0].text).toContain('temp directory');
  });
});
