/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, vi, expect, beforeEach } from 'vitest';

// Mock dependencies before they are imported
const mockRunNonInteractive = vi.fn();
vi.mock('../nonInteractiveCli.js', () => ({
  runNonInteractive: mockRunNonInteractive,
}));

import { VoiceSession } from './voiceSession.js';
import { Readable, PassThrough } from 'node:stream';

describe('VoiceSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process input lines and call runNonInteractive', async () => {
    const input = Readable.from(['hello world\n', 'another line\n']);
    const output = new PassThrough();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const voiceSession = new VoiceSession({} as any, {} as any, {
      input,
      output,
      createPromptId: () => 'test-id',
    });

    await voiceSession.start();

    expect(mockRunNonInteractive).toHaveBeenCalledTimes(2);
    expect(mockRunNonInteractive).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        input: expect.stringContaining('hello world'),
        prompt_id: 'test-id',
      }),
    );
    expect(mockRunNonInteractive).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: expect.stringContaining('another line'),
        prompt_id: 'test-id',
      }),
    );
  });

  it('should ignore empty or whitespace-only lines', async () => {
    const input = Readable.from(['\n', '  \n', 'only one call\n']);
    const output = new PassThrough();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const voiceSession = new VoiceSession({} as any, {} as any, {
      input,
      output,
    });

    await voiceSession.start();

    expect(mockRunNonInteractive).toHaveBeenCalledTimes(1);
    expect(mockRunNonInteractive).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining('only one call'),
      }),
    );
  });
});
