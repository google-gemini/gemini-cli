/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { newCommand } from './newCommand.js';
import { SessionEndReason, SessionStartSource } from '@google/gemini-cli-core';
import type { CommandContext } from './types.js';

describe('newCommand', () => {
  let mockContext: CommandContext;
  let mockGeminiClient: unknown;
  let mockConfig: unknown;
  let mockChatRecordingService: unknown;
  let mockHookSystem: unknown;
  let mockUi: unknown;

  beforeEach(() => {
    mockChatRecordingService = {
      initialize: vi.fn(),
    };

    mockHookSystem = {
      fireSessionEndEvent: vi.fn(),
      fireSessionStartEvent: vi.fn().mockResolvedValue({}),
    };

    mockGeminiClient = {
      resetChat: vi.fn(),
      getChat: vi.fn().mockReturnValue({
        getChatRecordingService: vi
          .fn()
          .mockReturnValue(mockChatRecordingService),
      }),
    };

    mockConfig = {
      getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
      getHookSystem: vi.fn().mockReturnValue(mockHookSystem),
      setSessionId: vi.fn(),
    };

    mockUi = {
      setDebugMessage: vi.fn(),
      addItem: vi.fn(),
      clear: vi.fn(),
    };

    mockContext = {
      services: {
        config: mockConfig,
      },
      ui: mockUi,
    } as unknown as CommandContext;

    // Mock randomUUID
    vi.mock('node:crypto', () => ({
      randomUUID: vi.fn().mockReturnValue('new-session-id'),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should reset chat and start a new session', async () => {
    await newCommand.action(mockContext, '');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mockHookSystem as any).fireSessionEndEvent).toHaveBeenCalledWith(
      SessionEndReason.Clear,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mockGeminiClient as any).resetChat).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mockConfig as any).setSessionId).toHaveBeenCalledWith(
      'new-session-id',
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mockChatRecordingService as any).initialize).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mockHookSystem as any).fireSessionStartEvent).toHaveBeenCalledWith(
      SessionStartSource.Clear,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mockUi as any).addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('Started a new chat session'),
      }),
      expect.any(Number),
    );

    // Ensure UI is NOT cleared
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mockUi as any).clear).not.toHaveBeenCalled();
  });
});
