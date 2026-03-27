/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { forkCommand } from './forkCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { GeminiClient } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';

const mockFork = vi.fn();

function makeContext(forkReturn: string | null | undefined) {
  if (forkReturn === undefined) {
    // No recording service available
    return createMockCommandContext({ services: { config: null } });
  }

  mockFork.mockReturnValue(forkReturn);
  return createMockCommandContext({
    services: {
      config: {
        getGeminiClient: () =>
          ({
            getChatRecordingService: () => ({
              fork: mockFork,
            }),
          }) as unknown as GeminiClient,
      },
    },
  });
}

describe('forkCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('metadata', () => {
    it('has the correct name', () => {
      expect(forkCommand.name).toBe('fork');
    });

    it('is marked autoExecute', () => {
      expect(forkCommand.autoExecute).toBe(true);
    });
  });

  it('returns an error when config is not available', async () => {
    const context = makeContext(undefined);
    const result = await forkCommand.action!(context, '');
    expect(result).toMatchObject({
      type: 'message',
      messageType: MessageType.ERROR,
    });
    expect(mockFork).not.toHaveBeenCalled();
  });

  it('returns an info message when there is nothing to fork', async () => {
    const context = makeContext(null);
    const result = await forkCommand.action!(context, '');
    expect(result).toMatchObject({
      type: 'message',
      messageType: MessageType.INFO,
    });
    expect(mockFork).toHaveBeenCalledOnce();
    expect((result as { content: string }).content).toContain(
      'Nothing to fork',
    );
  });

  it('returns a success message containing the short ID', async () => {
    const context = makeContext('a1b2c3d4');
    const result = await forkCommand.action!(context, '');

    expect(result).toMatchObject({
      type: 'message',
      messageType: MessageType.INFO,
    });
    expect(mockFork).toHaveBeenCalledOnce();
    const content = (result as { content: string }).content;
    expect(content).toContain('a1b2c3d4');
    expect(content).toContain('gemini --resume a1b2c3d4');
    expect(content).toContain('/chat');
  });
});
