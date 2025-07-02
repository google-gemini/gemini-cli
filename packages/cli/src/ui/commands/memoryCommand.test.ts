/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { memoryCommand } from './memoryCommand.js';
import { type CommandContext } from './types.js';
import { MessageType } from '../types.js';
import * as ShowMemoryCommandModule from '../hooks/useShowMemoryCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { Config } from '@google/gemini-cli-core';

vi.mock('../hooks/useShowMemoryCommand.js', () => ({
  createShowMemoryAction: vi.fn(() => vi.fn()),
}));

describe('memoryCommand', () => {
  let mockContext: CommandContext;
  let mockAddItem: ReturnType<typeof vi.fn>;
  let mockPerformMemoryRefresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // These are the specific mocks we care about for this test suite.
    // We can create them here to have a reference to them for our assertions.
    mockAddItem = vi.fn();
    mockPerformMemoryRefresh = vi.fn().mockResolvedValue(undefined);

    mockContext = createMockCommandContext({
      utils: {
        addMessage: mockAddItem,
      },
      actions: {
        performMemoryRefresh: mockPerformMemoryRefresh,
      },
      services: {
        config: { getProjectRoot: () => '/test/project' } as unknown as Config,
      },
    });
  });

  describe('/memory show', () => {
    it('should call the showMemoryAction', async () => {
      const mockReturnedShowAction = vi.fn();
      vi.mocked(ShowMemoryCommandModule.createShowMemoryAction).mockReturnValue(
        mockReturnedShowAction,
      );

      const showSubCommand = memoryCommand.subCommands?.find(
        (sc) => sc.name === 'show',
      );
      await showSubCommand?.action?.(mockContext, '');

      expect(
        ShowMemoryCommandModule.createShowMemoryAction,
      ).toHaveBeenCalledWith(
        mockContext.services.config,
        mockContext.services.settings,
        mockContext.utils.addMessage,
      );
      expect(mockReturnedShowAction).toHaveBeenCalled();
    });
  });

  describe('/memory add', () => {
    it('should return tool scheduling info on valid input', () => {
      const fact = 'Remember this fact';
      const addSubCommand = memoryCommand.subCommands?.find(
        (sc) => sc.name === 'add',
      );
      const commandResult = addSubCommand?.action?.(mockContext, fact);

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          content: `Attempting to save to memory: "${fact}"`,
        }),
      );

      expect(commandResult).toEqual({
        shouldScheduleTool: true,
        toolName: 'save_memory',
        toolArgs: { fact },
      });
    });

    it('should show usage error if no text is provided', () => {
      const addSubCommand = memoryCommand.subCommands?.find(
        (sc) => sc.name === 'add',
      );
      const commandResult = addSubCommand?.action?.(mockContext, ' ');

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          content: 'Usage: /memory add <text to remember>',
        }),
      );
      expect(commandResult).toBeUndefined();
    });
  });

  describe('/memory refresh', () => {
    it('should call performMemoryRefresh', async () => {
      const refreshSubCommand = memoryCommand.subCommands?.find(
        (sc) => sc.name === 'refresh',
      );
      await refreshSubCommand?.action?.(mockContext, '');
      expect(mockPerformMemoryRefresh).toHaveBeenCalled();
    });
  });
});
