/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { restartCommand } from './restartCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { formatDuration } from '../utils/formatters.js';

vi.mock('../utils/formatters.js');

describe('restartCommand', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T01:00:00Z'));
    vi.mocked(formatDuration).mockReturnValue('1h 0m 0s');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns a RestartActionReturn with the current session id when available', () => {
    const mockContext = createMockCommandContext({
      session: {
        stats: {
          sessionStartTime: new Date('2025-01-01T00:00:00Z'),
        },
      },
      services: {
        agentContext: {
          config: {
            getSessionId: () => 'session-abc',
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      },
    });

    if (!restartCommand.action) throw new Error('Action is not defined');
    const result = restartCommand.action(mockContext, 'restart');

    expect(formatDuration).toHaveBeenCalledWith(3600000);
    expect(result).toEqual({
      type: 'restart',
      resumeSessionId: 'session-abc',
      messages: [
        {
          type: 'user',
          text: '/restart',
          id: expect.any(Number),
        },
        {
          type: 'quit',
          duration: '1h 0m 0s',
          id: expect.any(Number),
        },
      ],
    });
  });

  it('returns undefined resumeSessionId when no agentContext is available', () => {
    const mockContext = createMockCommandContext({
      session: {
        stats: {
          sessionStartTime: new Date('2025-01-01T00:00:00Z'),
        },
      },
    });

    if (!restartCommand.action) throw new Error('Action is not defined');
    const result = restartCommand.action(mockContext, 'restart');

    expect(result).toMatchObject({
      type: 'restart',
      resumeSessionId: undefined,
    });
  });
});
