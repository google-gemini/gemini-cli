/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { newCommand } from './newCommand.js';
import { SessionEndReason, SessionStartSource } from '@google/gemini-cli-core';
import type { CommandContext } from './types.js';

describe('newCommand', () => {
  let mockContext: CommandContext;
  let mockGeminiClient: {
    resetChat: ReturnType<typeof vi.fn>;
    getChat: ReturnType<typeof vi.fn>;
  };
  let mockConfig: {
    getGeminiClient: ReturnType<typeof vi.fn>;
    getHookSystem: ReturnType<typeof vi.fn>;
    setSessionId: ReturnType<typeof vi.fn>;
  };
  let mockChatRecordingService: {
    initialize: ReturnType<typeof vi.fn>;
  };
  let mockHookSystem: {
    fireSessionEndEvent: ReturnType<typeof vi.fn>;
    fireSessionStartEvent: ReturnType<typeof vi.fn>;
  };
  let mockUi: {
    setDebugMessage: ReturnType<typeof vi.fn>;
    addItem: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

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
    await newCommand.action!(mockContext, '');

    expect(mockHookSystem.fireSessionEndEvent).toHaveBeenCalledWith(
      SessionEndReason.Clear,
    );
    expect(mockGeminiClient.resetChat).toHaveBeenCalled();
    expect(mockConfig.setSessionId).toHaveBeenCalledWith('new-session-id');
    expect(mockChatRecordingService.initialize).toHaveBeenCalled();
    expect(mockHookSystem.fireSessionStartEvent).toHaveBeenCalledWith(
      SessionStartSource.New,
    );
    expect(mockUi.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('Started a new chat session'),
      }),
      expect.any(Number),
    );

    // Ensure UI is NOT cleared
    expect(mockUi.clear).not.toHaveBeenCalled();
  });
});
