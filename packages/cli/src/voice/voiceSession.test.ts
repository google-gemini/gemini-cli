/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, vi, expect, beforeEach } from 'vitest';

// Mock dependencies before they are imported
const mockRunNonInteractive = vi.hoisted(() => vi.fn());
vi.mock('../nonInteractiveCli.js', () => ({
  runNonInteractive: mockRunNonInteractive,
}));

import { VoiceSession } from './voiceSession.js';
import { PassThrough, Readable } from 'node:stream';

describe('VoiceSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process recognized commands and call runNonInteractive', async () => {
    const input = Readable.from(['install dependencies\n', 'build project\n']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const voiceSession = new VoiceSession({} as any, {} as any, {
      input,
      createPromptId: () => 'test-id',
    });

    await voiceSession.start();

    expect(mockRunNonInteractive).toHaveBeenCalledTimes(2);
    expect(mockRunNonInteractive).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        input: 'npm install',
        prompt_id: 'test-id',
      }),
    );
    expect(mockRunNonInteractive).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: 'npm run build',
        prompt_id: 'test-id',
      }),
    );
  });

  it('should ignore empty or whitespace-only lines', async () => {
    const input = Readable.from(['\n', '  \n', 'build project\n']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const voiceSession = new VoiceSession({} as any, {} as any, {
      input,
    });

    await voiceSession.start();

    expect(mockRunNonInteractive).toHaveBeenCalledTimes(1);
    expect(mockRunNonInteractive).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'npm run build',
      }),
    );
  });

  it('should print suggestion when command is not recognized but similar', async () => {
    const input = Readable.from(['install dep\n']);
    const output = new PassThrough();
    let printed = '';
    output.on('data', (chunk: Buffer | string) => {
      printed += chunk.toString();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const voiceSession = new VoiceSession({} as any, {} as any, {
      input,
      output,
    });

    await voiceSession.start();

    expect(mockRunNonInteractive).not.toHaveBeenCalled();
    expect(printed).toContain('Did you mean: npm install ?');
  });

  it('should print unknown message when no suggestion exists', async () => {
    const input = Readable.from(['say hello to world\n']);
    const output = new PassThrough();
    let printed = '';
    output.on('data', (chunk: Buffer | string) => {
      printed += chunk.toString();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const voiceSession = new VoiceSession({} as any, {} as any, {
      input,
      output,
    });

    await voiceSession.start();

    expect(mockRunNonInteractive).not.toHaveBeenCalled();
    expect(printed).toContain('Voice command not recognized.');
  });
});
