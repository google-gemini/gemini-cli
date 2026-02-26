/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mock } from 'vitest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { newCommand } from './newCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

const { mockSetLastPromptTokenCount, mockFlushTelemetry } = vi.hoisted(() => ({
  mockSetLastPromptTokenCount: vi.fn(),
  mockFlushTelemetry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    uiTelemetryService: {
      setLastPromptTokenCount: mockSetLastPromptTokenCount,
    },
    flushTelemetry: mockFlushTelemetry,
  };
});

import type { GeminiClient } from '@google/gemini-cli-core';
import { SessionEndReason, SessionStartSource } from '@google/gemini-cli-core';

describe('newCommand', () => {
  let mockContext: CommandContext;
  let mockResetChat: ReturnType<typeof vi.fn>;
  let mockHintClear: ReturnType<typeof vi.fn>;
  let mockSetSessionId: ReturnType<typeof vi.fn>;
  let mockFireSessionEndEvent: ReturnType<typeof vi.fn>;
  let mockFireSessionStartEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockResetChat = vi.fn().mockResolvedValue(undefined);
    mockHintClear = vi.fn();
    mockSetSessionId = vi.fn();
    mockFireSessionEndEvent = vi.fn().mockResolvedValue(undefined);
    mockFireSessionStartEvent = vi
      .fn()
      .mockResolvedValue({ systemMessage: 'New session started' });

    mockContext = createMockCommandContext({
      services: {
        config: {
          getGeminiClient: () =>
            ({
              resetChat: mockResetChat,
            }) as unknown as GeminiClient,
          setSessionId: mockSetSessionId,
          getEnableHooks: vi.fn().mockReturnValue(false),
          getMessageBus: vi.fn().mockReturnValue(undefined),
          getHookSystem: vi.fn().mockReturnValue({
            fireSessionEndEvent: mockFireSessionEndEvent,
            fireSessionStartEvent: mockFireSessionStartEvent,
          }),
          userHintService: {
            clear: mockHintClear,
          },
        },
      },
    });
  });

  it('starts a new session with lifecycle hooks and correct ordering', async () => {
    if (!newCommand.action) {
      throw new Error('newCommand must have an action.');
    }

    await newCommand.action(mockContext, '');

    expect(mockContext.ui.setDebugMessage).toHaveBeenCalledWith(
      'Starting new session and preserving current conversation.',
    );
    expect(mockFireSessionEndEvent).toHaveBeenCalledWith(SessionEndReason.New);
    expect(mockSetSessionId).toHaveBeenCalledTimes(1);
    expect(mockResetChat).toHaveBeenCalledTimes(1);
    expect(mockHintClear).toHaveBeenCalledTimes(1);
    expect(mockFireSessionStartEvent).toHaveBeenCalledWith(
      SessionStartSource.New,
    );
    expect(mockFlushTelemetry).toHaveBeenCalledWith(
      mockContext.services.config,
    );
    expect(mockSetLastPromptTokenCount).toHaveBeenCalledWith(0);
    expect(mockContext.ui.clear).toHaveBeenCalledTimes(1);

    const setSessionIdOrder = mockSetSessionId.mock.invocationCallOrder[0];
    const resetChatOrder = mockResetChat.mock.invocationCallOrder[0];
    const clearHintsOrder = mockHintClear.mock.invocationCallOrder[0];
    const clearUiOrder = (mockContext.ui.clear as Mock).mock
      .invocationCallOrder[0];

    expect(setSessionIdOrder).toBeLessThan(resetChatOrder);
    expect(resetChatOrder).toBeLessThan(clearHintsOrder);
    expect(clearHintsOrder).toBeLessThan(clearUiOrder);
  });

  it('does not attempt reset when config is unavailable', async () => {
    if (!newCommand.action) {
      throw new Error('newCommand must have an action.');
    }

    const nullConfigContext = createMockCommandContext({
      services: {
        config: null,
      },
    });

    await newCommand.action(nullConfigContext, '');

    expect(nullConfigContext.ui.setDebugMessage).toHaveBeenCalledWith(
      'Starting new session.',
    );
    expect(mockResetChat).not.toHaveBeenCalled();
    expect(mockSetSessionId).not.toHaveBeenCalled();
    expect(mockFlushTelemetry).not.toHaveBeenCalled();
    expect(mockSetLastPromptTokenCount).toHaveBeenCalledWith(0);
    expect(nullConfigContext.ui.clear).toHaveBeenCalledTimes(1);
  });
});
