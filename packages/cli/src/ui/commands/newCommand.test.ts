/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { newCommand } from './newCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

// Mock the telemetry service
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    uiTelemetryService: {
      setLastPromptTokenCount: vi.fn(),
    },
  };
});

import type { GeminiClient } from '@google/gemini-cli-core';
import { uiTelemetryService } from '@google/gemini-cli-core';

describe('newCommand', () => {
  let mockContext: CommandContext;
  let mockResetChat: ReturnType<typeof vi.fn>;
  let mockHintClear: ReturnType<typeof vi.fn>;
  let mockInitialize: ReturnType<typeof vi.fn>;
  let mockSetSessionId: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockResetChat = vi.fn().mockResolvedValue(undefined);
    mockHintClear = vi.fn();
    mockInitialize = vi.fn();
    mockSetSessionId = vi.fn();
    vi.clearAllMocks();

    mockContext = createMockCommandContext({
      services: {
        config: {
          getGeminiClient: () =>
            ({
              resetChat: mockResetChat,
              getChat: () => ({
                getChatRecordingService: () => ({
                  initialize: mockInitialize,
                }),
              }),
            }) as unknown as GeminiClient,
          setSessionId: mockSetSessionId,
          getEnableHooks: vi.fn().mockReturnValue(false),
          getMessageBus: vi.fn().mockReturnValue(undefined),
          getHookSystem: vi.fn().mockReturnValue({
            fireSessionEndEvent: vi.fn().mockResolvedValue(undefined),
            fireSessionStartEvent: vi.fn().mockResolvedValue(undefined),
          }),
          userHintService: {
            clear: mockHintClear,
          },
        },
      },
    });
  });

  it('should reset chat, assign a new session ID, reinitialize recording, reset telemetry, and clear UI', async () => {
    if (!newCommand.action) {
      throw new Error('newCommand must have an action.');
    }

    await newCommand.action(mockContext, '');

    expect(mockContext.ui.setDebugMessage).toHaveBeenCalledWith(
      'Starting new session and preserving current conversation.',
    );
    expect(mockResetChat).toHaveBeenCalledTimes(1);
    expect(mockSetSessionId).toHaveBeenCalledTimes(1);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockHintClear).toHaveBeenCalledTimes(1);
    expect(uiTelemetryService.setLastPromptTokenCount).toHaveBeenCalledWith(0);
    expect(mockContext.ui.clear).toHaveBeenCalledTimes(1);
  });

  it('should assign a new session ID before reinitializing the recording service', async () => {
    if (!newCommand.action) {
      throw new Error('newCommand must have an action.');
    }

    await newCommand.action(mockContext, '');

    const setSessionIdOrder = mockSetSessionId.mock.invocationCallOrder[0];
    const initializeOrder = mockInitialize.mock.invocationCallOrder[0];

    expect(setSessionIdOrder).toBeLessThan(initializeOrder);
  });

  it('should not attempt to reset chat if config service is not available', async () => {
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
    expect(uiTelemetryService.setLastPromptTokenCount).toHaveBeenCalledWith(0);
    expect(nullConfigContext.ui.clear).toHaveBeenCalledTimes(1);
  });
});
