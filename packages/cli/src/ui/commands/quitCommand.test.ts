/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { quitCommand } from './quitCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { formatDuration } from '../utils/formatters.js';

vi.mock('../utils/formatters.js');

describe('quitCommand', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T01:00:00Z'));
    vi.mocked(formatDuration).mockReturnValue('1h 0m 0s');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns a QuitActionReturn object with the correct messages', () => {
    const mockContext = createMockCommandContext({
      session: {
        stats: {
          sessionStartTime: new Date('2025-01-01T00:00:00Z'),
        },
      },
    });

    if (!quitCommand.action) throw new Error('Action is not defined');
    const result = quitCommand.action(mockContext, 'quit');

    expect(formatDuration).toHaveBeenCalledWith(3600000); // 1 hour in ms
    expect(result).toEqual({
      type: 'quit',
      messages: [
        {
          type: 'user',
          text: '/quit',
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
});
