/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { patchStdio, createWorkingStdio } from './stdio.js';
import { coreEvents } from './events.js';

vi.mock('./events.js', () => ({
  coreEvents: {
    emitOutput: vi.fn(),
  },
}));

describe('stdio utils', () => {
  let originalStdoutWrite: typeof process.stdout.write;
  let originalStderrWrite: typeof process.stderr.write;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    originalStderrWrite = process.stderr.write;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    vi.restoreAllMocks();
  });

  it('patchStdio redirects stdout and stderr to coreEvents', () => {
    const cleanup = patchStdio();

    process.stdout.write('test stdout');
    expect(coreEvents.emitOutput).toHaveBeenCalledWith(
      false,
      'test stdout',
      undefined,
    );

    process.stderr.write('test stderr');
    expect(coreEvents.emitOutput).toHaveBeenCalledWith(
      true,
      'test stderr',
      undefined,
    );

    cleanup();

    // Verify cleanup
    expect(process.stdout.write).toBe(originalStdoutWrite);
    expect(process.stderr.write).toBe(originalStderrWrite);
  });

  it('createWorkingStdio writes to real stdout/stderr bypassing patch', () => {
    const cleanup = patchStdio();
    const { stdout, stderr } = createWorkingStdio();

    stdout.write('working stdout');
    expect(coreEvents.emitOutput).not.toHaveBeenCalled();

    stderr.write('working stderr');
    expect(coreEvents.emitOutput).not.toHaveBeenCalled();

    cleanup();
  });
});
