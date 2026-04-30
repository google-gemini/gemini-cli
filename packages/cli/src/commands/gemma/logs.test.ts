/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { exitCli } from '../utils.js';
import { getLogFilePath } from './constants.js';
import { logsCommand, readLastLines } from './logs.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const { mockCoreDebugLogger } = await import(
    '../../test-utils/mockDebugLogger.js'
  );
  return mockCoreDebugLogger(
    await importOriginal<typeof import('@google/gemini-cli-core')>(),
    {
      stripAnsi: false,
    },
  );
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

vi.mock('./constants.js', () => ({
  getLogFilePath: vi.fn(),
}));

function createMockChild(): ChildProcess {
  return Object.assign(new EventEmitter(), {
    kill: vi.fn(),
  }) as unknown as ChildProcess;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('readLastLines', () => {
  const tempFiles: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempFiles
        .splice(0)
        .map((filePath) => fs.promises.rm(filePath, { force: true })),
    );
  });

  it('returns only the requested tail lines without reading the whole file eagerly', async () => {
    const filePath = path.join(
      os.tmpdir(),
      `gemma-logs-${Date.now()}-${Math.random().toString(36).slice(2)}.log`,
    );
    tempFiles.push(filePath);

    const content = Array.from({ length: 2000 }, (_, i) => `line-${i + 1}`)
      .join('\n')
      .concat('\n');
    await fs.promises.writeFile(filePath, content, 'utf-8');

    await expect(readLastLines(filePath, 3)).resolves.toBe(
      'line-1998\nline-1999\nline-2000\n',
    );
  });

  it('returns an empty string when zero lines are requested', async () => {
    const filePath = path.join(
      os.tmpdir(),
      `gemma-logs-${Date.now()}-${Math.random().toString(36).slice(2)}.log`,
    );
    tempFiles.push(filePath);
    await fs.promises.writeFile(filePath, 'line-1\nline-2\n', 'utf-8');

    await expect(readLastLines(filePath, 0)).resolves.toBe('');
  });
});

describe('logsCommand', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    });
    vi.mocked(getLogFilePath).mockReturnValue('/tmp/gemma.log');
    vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('waits for the tail process to close before exiting in follow mode', async () => {
    const child = createMockChild();
    vi.mocked(spawn).mockReturnValue(child);

    let resolved = false;
    const handlerPromise = (
      logsCommand.handler as (argv: Record<string, unknown>) => Promise<void>
    )({}).then(() => {
      resolved = true;
    });

    await flushMicrotasks();

    expect(spawn).toHaveBeenCalledWith(
      'tail',
      ['-f', '-n', '20', '/tmp/gemma.log'],
      { stdio: 'inherit' },
    );
    expect(resolved).toBe(false);
    expect(exitCli).not.toHaveBeenCalled();

    child.emit('close', 0);
    await handlerPromise;

    expect(exitCli).toHaveBeenCalledWith(0);
  });

  it('uses one-shot tail output when follow is disabled', async () => {
    const child = createMockChild();
    vi.mocked(spawn).mockReturnValue(child);

    const handlerPromise = (
      logsCommand.handler as (argv: Record<string, unknown>) => Promise<void>
    )({ follow: false });

    await flushMicrotasks();

    expect(spawn).toHaveBeenCalledWith('tail', ['-n', '20', '/tmp/gemma.log'], {
      stdio: 'inherit',
    });

    child.emit('close', 0);
    await handlerPromise;

    expect(exitCli).toHaveBeenCalledWith(0);
  });

  it('follows from the requested line count when both --lines and --follow are set', async () => {
    const child = createMockChild();
    vi.mocked(spawn).mockReturnValue(child);

    const handlerPromise = (
      logsCommand.handler as (argv: Record<string, unknown>) => Promise<void>
    )({ lines: 5, follow: true });

    await flushMicrotasks();

    expect(spawn).toHaveBeenCalledWith(
      'tail',
      ['-f', '-n', '5', '/tmp/gemma.log'],
      { stdio: 'inherit' },
    );

    child.emit('close', 0);
    await handlerPromise;

    expect(exitCli).toHaveBeenCalledWith(0);
  });
});
