/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { resetCommand } from './resetCommand.js';
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

import { uiTelemetryService } from '@google/gemini-cli-core';
import type { GeminiClient } from '@google/gemini-cli-core';

describe('resetCommand', () => {
  let mockContext: CommandContext;
  let mockResetChat: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockResetChat = vi.fn().mockResolvedValue(undefined);
    vi.clearAllMocks();

    mockContext = createMockCommandContext({
      services: {
        config: {
          getGeminiClient: () =>
            ({
              resetChat: mockResetChat,
            }) as unknown as GeminiClient,
        },
      },
    });
  });

  it('should set debug message, reset chat, and reset telemetry when config is available', async () => {
    if (!resetCommand.action) {
      throw new Error('resetCommand must have an action.');
    }

    await resetCommand.action(mockContext, '');

    expect(mockContext.ui.setDebugMessage).toHaveBeenCalledWith(
      'Resetting terminal and resetting chat.',
    );
    expect(mockContext.ui.setDebugMessage).toHaveBeenCalledTimes(1);

    expect(mockResetChat).toHaveBeenCalledTimes(1);
    expect(uiTelemetryService.setLastPromptTokenCount).toHaveBeenCalledWith(0);
    expect(uiTelemetryService.setLastPromptTokenCount).toHaveBeenCalledTimes(1);
  });

  it('should not attempt to reset chat if config service is not available', async () => {
    if (!resetCommand.action) {
      throw new Error('resetCommand must have an action.');
    }

    const nullConfigContext = createMockCommandContext({
      services: {
        config: null,
      },
    });

    await resetCommand.action(nullConfigContext, '');

    expect(nullConfigContext.ui.setDebugMessage).toHaveBeenCalledWith(
      'Resetting terminal.',
    );
    expect(mockResetChat).not.toHaveBeenCalled();
    expect(uiTelemetryService.setLastPromptTokenCount).toHaveBeenCalledWith(0);
    expect(uiTelemetryService.setLastPromptTokenCount).toHaveBeenCalledTimes(1);
  });
});
