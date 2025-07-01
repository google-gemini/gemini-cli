/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { clearCommand } from './clearCommand.js';
import { type CommandContext } from './types.js';
import { GeminiClient } from '@google/gemini-cli-core';

describe('clearCommand', () => {
  let mockContext: CommandContext;
  let mockClearItems: ReturnType<typeof vi.fn>;
  let mockResetChat: ReturnType<typeof vi.fn>;
  let mockRefreshStatic: ReturnType<typeof vi.fn>;
  let mockOnDebugMessage: ReturnType<typeof vi.fn>;
  let mockConsoleClear: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockClearItems = vi.fn();
    mockResetChat = vi.fn().mockResolvedValue(undefined);
    mockRefreshStatic = vi.fn();
    mockOnDebugMessage = vi.fn();
    mockConsoleClear = vi.spyOn(console, 'clear').mockImplementation(() => {});

    const mockGeminiClient = {
      resetChat: mockResetChat,
    } as unknown as GeminiClient;

    mockContext = {
      ui: {
        clearItems: mockClearItems,
        refreshStatic: mockRefreshStatic,
      },
      services: {
        config: {
          getGeminiClient: () => mockGeminiClient,
        },
      },
      utils: {
        onDebugMessage: mockOnDebugMessage,
      },
    } as unknown as CommandContext;
  });

  it('should call clearItems, resetChat, console.clear, and refreshStatic', async () => {
    await clearCommand.action(mockContext, { mainCommand: 'clear', rest: '' });

    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      'Clearing terminal and resetting chat.',
    );
    expect(mockClearItems).toHaveBeenCalled();
    expect(mockResetChat).toHaveBeenCalled();
    expect(mockConsoleClear).toHaveBeenCalled();
    expect(mockRefreshStatic).toHaveBeenCalled();
  });
});
