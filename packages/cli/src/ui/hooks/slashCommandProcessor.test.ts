/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const { mockProcessExit } = vi.hoisted(() => ({
  mockProcessExit: vi.fn((_code?: number): never => undefined as never),
}));

vi.mock('node:process', () => ({
  exit: mockProcessExit,
  cwd: vi.fn(() => '/mock/cwd'),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { act, renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import { useSlashCommandProcessor } from './slashCommandProcessor.js';
import { MessageType } from '../types.js';
import * as memoryUtils from '../../config/memoryUtils.js';
import { type Config, MemoryTool } from '@gemini-code/server';
import * as fsPromises from 'node:fs/promises';

// Import the module for mocking its functions
import * as ShowMemoryCommandModule from './useShowMemoryCommand.js';

// Mock dependencies
vi.mock('./useShowMemoryCommand.js', () => ({
  SHOW_MEMORY_COMMAND_NAME: '/memory show',
  createShowMemoryAction: vi.fn(() => vi.fn()),
}));

// Spy on the static method we want to mock
const performAddMemoryEntrySpy = vi.spyOn(MemoryTool, 'performAddMemoryEntry');

describe('useSlashCommandProcessor', () => {
  let mockAddItem: ReturnType<typeof vi.fn>;
  let mockClearItems: ReturnType<typeof vi.fn>;
  let mockRefreshStatic: ReturnType<typeof vi.fn>;
  let mockSetShowHelp: ReturnType<typeof vi.fn>;
  let mockOnDebugMessage: ReturnType<typeof vi.fn>;
  let mockOpenThemeDialog: ReturnType<typeof vi.fn>;
  let mockPerformMemoryRefresh: ReturnType<typeof vi.fn>;
  let mockConfig: Config;
  let mockCorgiMode: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAddItem = vi.fn();
    mockClearItems = vi.fn();
    mockRefreshStatic = vi.fn();
    mockSetShowHelp = vi.fn();
    mockOnDebugMessage = vi.fn();
    mockOpenThemeDialog = vi.fn();
    mockPerformMemoryRefresh = vi.fn().mockResolvedValue(undefined);
    mockConfig = { getDebugMode: vi.fn(() => false) } as unknown as Config;
    mockCorgiMode = vi.fn();

    // Clear mocks for fsPromises if they were used directly or indirectly
    vi.mocked(fsPromises.readFile).mockClear();
    vi.mocked(fsPromises.writeFile).mockClear();
    vi.mocked(fsPromises.mkdir).mockClear();

    performAddMemoryEntrySpy.mockReset(); // Reset the spy
    vi.spyOn(memoryUtils, 'deleteLastMemoryEntry').mockImplementation(vi.fn());
    vi.spyOn(memoryUtils, 'deleteAllAddedMemoryEntries').mockImplementation(
      vi.fn(),
    );

    vi.mocked(memoryUtils.deleteLastMemoryEntry).mockClear();
    vi.mocked(memoryUtils.deleteAllAddedMemoryEntries).mockClear();

    mockProcessExit.mockClear();
    (ShowMemoryCommandModule.createShowMemoryAction as Mock).mockClear();
    mockPerformMemoryRefresh.mockClear();
  });

  const getProcessor = () => {
    const { result } = renderHook(() =>
      useSlashCommandProcessor(
        mockConfig,
        mockAddItem,
        mockClearItems,
        mockRefreshStatic,
        mockSetShowHelp,
        mockOnDebugMessage,
        mockOpenThemeDialog,
        mockPerformMemoryRefresh,
        mockCorgiMode,
      ),
    );
    return result.current;
  };

  describe('/memory add', () => {
    it('should call MemoryTool.performAddMemoryEntry and refresh on valid input', async () => {
      performAddMemoryEntrySpy.mockResolvedValue(undefined);
      const { handleSlashCommand } = getProcessor();
      const fact = 'Remember this fact';
      await act(async () => {
        handleSlashCommand(`/memory add ${fact}`);
      });
      expect(mockAddItem).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          type: MessageType.USER,
          text: `/memory add ${fact}`,
        }),
        expect.any(Number),
      );
      expect(performAddMemoryEntrySpy).toHaveBeenCalledWith(
        fact,
        memoryUtils.getGlobalMemoryFilePath(), // Ensure this path is correct
        {
          readFile: fsPromises.readFile,
          writeFile: fsPromises.writeFile,
          mkdir: fsPromises.mkdir,
        },
      );
      expect(mockPerformMemoryRefresh).toHaveBeenCalled();
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.INFO,
          text: `Successfully added to memory: "${fact}"`,
        }),
        expect.any(Number),
      );
    });

    it('should show usage error if no text is provided', async () => {
      const { handleSlashCommand } = getProcessor();
      await act(async () => {
        handleSlashCommand('/memory add ');
      });
      expect(performAddMemoryEntrySpy).not.toHaveBeenCalled();
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Usage: /memory add <text to remember>',
        }),
        expect.any(Number),
      );
    });

    it('should handle error from MemoryTool.performAddMemoryEntry', async () => {
      const fact = 'Another fact';
      performAddMemoryEntrySpy.mockRejectedValue(
        new Error('[MemoryTool] Failed to add memory entry: Disk full'),
      );
      const { handleSlashCommand } = getProcessor();
      await act(async () => {
        handleSlashCommand(`/memory add ${fact}`);
      });
      expect(performAddMemoryEntrySpy).toHaveBeenCalledWith(
        fact,
        memoryUtils.getGlobalMemoryFilePath(),
        {
          readFile: fsPromises.readFile,
          writeFile: fsPromises.writeFile,
          mkdir: fsPromises.mkdir,
        },
      );
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Failed to add memory: [MemoryTool] Failed to add memory entry: Disk full',
        }),
        expect.any(Number),
      );
    });
  });

  describe('/memory show', () => {
    it('should call the showMemoryAction', async () => {
      const mockReturnedShowAction = vi.fn();
      vi.mocked(ShowMemoryCommandModule.createShowMemoryAction).mockReturnValue(
        mockReturnedShowAction,
      );
      const { handleSlashCommand } = getProcessor();
      await act(async () => {
        handleSlashCommand('/memory show');
      });
      expect(
        ShowMemoryCommandModule.createShowMemoryAction,
      ).toHaveBeenCalledWith(mockConfig, expect.any(Function));
      expect(mockReturnedShowAction).toHaveBeenCalled();
    });
  });

  describe('/memory refresh', () => {
    it('should call performMemoryRefresh', async () => {
      const { handleSlashCommand } = getProcessor();
      await act(async () => {
        handleSlashCommand('/memory refresh');
      });
      expect(mockPerformMemoryRefresh).toHaveBeenCalled();
    });
  });

  describe('Unknown /memory subcommand', () => {
    it('should show an error for unknown /memory subcommand', async () => {
      const { handleSlashCommand } = getProcessor();
      await act(async () => {
        handleSlashCommand('/memory foobar');
      });
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Unknown /memory command: foobar. Available: show, refresh, add',
        }),
        expect.any(Number),
      );
    });
  });

  describe('Other commands', () => {
    it('/help should open help', async () => {
      const { handleSlashCommand } = getProcessor();
      await act(async () => {
        handleSlashCommand('/help');
      });
      expect(mockSetShowHelp).toHaveBeenCalledWith(true);
    });
  });

  describe('Unknown command', () => {
    it('should show an error for a general unknown command', async () => {
      const { handleSlashCommand } = getProcessor();
      await act(async () => {
        handleSlashCommand('/unknowncommand');
      });
      expect(mockAddItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Unknown command: /unknowncommand',
        }),
        expect.any(Number),
      );
    });
  });
});
