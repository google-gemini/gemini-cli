/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import { resumeCommand } from './resumeCommand.js';
import type { CommandContext } from './types.js';

vi.mock('../../utils/sessionUtils.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../utils/sessionUtils.js')>();

  class MockSessionSelector {
    async resolveSession(resumeArg: string) {
      if (resumeArg === 'error') {
        throw new Error('Failed to resolve session');
      }

      return {
        sessionPath: '/test/session.json',
        sessionData: {
          sessionId: 'session-123',
          messages: [
            { type: 'user', content: 'Hello' },
            { type: 'gemini', content: 'Hi there' },
          ],
        },
        displayInfo: 'Session 1: Hello (2 messages, just now)',
      };
    }
  }

  return {
    ...original,
    SessionSelector: MockSessionSelector,
  };
});

describe('resumeCommand', () => {
  let mockConfig: Config;
  let mockContext: CommandContext;

  beforeEach(() => {
    mockConfig = {
      setSessionId: vi.fn(),
    } as unknown as Config;

    mockContext = createMockCommandContext();
  });

  it('returns error message when no identifier is provided', async () => {
    const result = await resumeCommand.action?.(mockContext, '');

    expect(result).toStrictEqual({
      type: 'message',
      messageType: 'error',
      content:
        'Missing session identifier. Usage: /resume <number|uuid|latest>. Use --list-sessions to see available sessions.',
    });
  });

  it('returns error message when config is not available', async () => {
    const contextWithoutConfig: CommandContext = {
      ...mockContext,
      services: {
        ...mockContext.services,
        config: null,
      },
    };

    const result = await resumeCommand.action?.(contextWithoutConfig, 'latest');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Configuration is not available.',
    });
  });

  it('loads history and sets session id for a valid identifier', async () => {
    const result = await resumeCommand.action?.(mockContext, 'latest');

    expect(mockConfig.setSessionId).toHaveBeenCalledWith('session-123');
    expect(result?.type).toBe('load_history');

    if (result?.type === 'load_history') {
      expect(result.history).toHaveLength(2);
      expect(result.clientHistory).toHaveLength(2);
    }
  });

  it('surfaces errors from session resolution', async () => {
    const result = await resumeCommand.action?.(mockContext, 'error');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.ERROR,
        text: 'Error resuming session: Failed to resolve session',
      },
      expect.any(Number),
    );

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Error resuming session: Failed to resolve session',
    });
  });
});
