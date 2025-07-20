/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const { mockProcessExit } = vi.hoisted(() => ({
  mockProcessExit: vi.fn((_code?: number): never => undefined as never),
}));

vi.mock('node:process', () => ({
  default: {
    exit: mockProcessExit,
  },
}));

const mockLoadCommands = vi.fn();
vi.mock('../../services/BuiltinCommandLoader.js', () => ({
  BuiltinCommandLoader: vi.fn().mockImplementation(() => ({
    loadCommands: mockLoadCommands,
  })),
}));

vi.mock('../contexts/SessionContext.js', () => ({
  useSessionStats: vi.fn(() => ({ stats: {} })),
}));

import { act, renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { useSlashCommandProcessor } from './slashCommandProcessor.js';
import { SlashCommand } from '../commands/types.js';
import { Config } from '@google/gemini-cli-core';
import { LoadedSettings } from '../../config/settings.js';
import { MessageType } from '../types.js';
import { BuiltinCommandLoader } from '../../services/BuiltinCommandLoader.js';

describe('useSlashCommandProcessor', () => {
  const mockAddItem = vi.fn();
  const mockClearItems = vi.fn();
  const mockLoadHistory = vi.fn();
  const mockSetShowHelp = vi.fn();
  const mockOpenAuthDialog = vi.fn();
  const mockSetQuittingMessages = vi.fn();

  const mockConfig = {
    getProjectRoot: () => '/mock/cwd',
    getSessionId: () => 'test-session',
    getGeminiClient: () => ({
      setHistory: vi.fn().mockResolvedValue(undefined),
    }),
  } as unknown as Config;

  const mockSettings = {} as LoadedSettings;

  beforeEach(() => {
    vi.clearAllMocks();
    (vi.mocked(BuiltinCommandLoader) as Mock).mockClear();
    mockLoadCommands.mockResolvedValue([]);
  });

  const setupProcessorHook = (commands: SlashCommand[] = []) => {
    mockLoadCommands.mockResolvedValue(Object.freeze(commands));
    const { result } = renderHook(() =>
      useSlashCommandProcessor(
        mockConfig,
        mockSettings,
        mockAddItem,
        mockClearItems,
        mockLoadHistory,
        vi.fn(), // refreshStatic
        mockSetShowHelp,
        vi.fn(), // onDebugMessage
        vi.fn(), // openThemeDialog
        mockOpenAuthDialog,
        vi.fn(), // openEditorDialog
        vi.fn(), // toggleCorgiMode
        mockSetQuittingMessages,
        vi.fn(), // openPrivacyNotice
      ),
    );

    return result;
  };

  describe('Initialization and Command Loading', () => {
    it('should initialize CommandService with BuiltinCommandLoader', () => {
      setupProcessorHook();
      expect(BuiltinCommandLoader).toHaveBeenCalledTimes(1);
      expect(BuiltinCommandLoader).toHaveBeenCalledWith(mockConfig);
    });

    it('should call loadCommands and populate state after mounting', async () => {
      const testCommand: SlashCommand = {
        name: 'test',
        description: 'a test command',
        kind: 'built-in',
      };
      const result = setupProcessorHook([testCommand]);

      await waitFor(() => {
        expect(result.current.slashCommands).toHaveLength(1);
      });

      expect(result.current.slashCommands[0]?.name).toBe('test');
      expect(mockLoadCommands).toHaveBeenCalledTimes(1);
    });

    it('should provide an immutable array of commands to consumers', async () => {
      const testCommand: SlashCommand = {
        name: 'test',
        description: 'a test command',
        kind: 'built-in',
      };
      const result = setupProcessorHook([testCommand]);

      await waitFor(() => {
        expect(result.current.slashCommands).toHaveLength(1);
      });

      const commands = result.current.slashCommands;

      expect(() => {
        // @ts-expect-error - We are intentionally testing a violation of the readonly type.
        commands.push({
          name: 'rogue',
          description: 'a rogue command',
          kind: 'built-in',
        });
      }).toThrow(TypeError);
    });
  });

  describe('Command Execution Logic', () => {
    it('should display an error for an unknown command', async () => {
      const result = setupProcessorHook();
      await waitFor(() => expect(result.current.slashCommands).toBeDefined());

      await act(async () => {
        await result.current.handleSlashCommand('/nonexistent');
      });

      // Expect 2 calls: one for the user's input, one for the error message.
      expect(mockAddItem).toHaveBeenCalledTimes(2);
      expect(mockAddItem).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Unknown command: /nonexistent',
        }),
        expect.any(Number),
      );
    });

    it('should display help for a parent command invoked without a subcommand', async () => {
      const parentCommand: SlashCommand = {
        name: 'parent',
        description: 'a parent command',
        kind: 'built-in',
        subCommands: [
          {
            name: 'child1',
            description: 'First child.',
            kind: 'built-in',
          },
        ],
      };
      const result = setupProcessorHook([parentCommand]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('/parent');
      });

      expect(mockAddItem).toHaveBeenCalledTimes(2);
      expect(mockAddItem).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining(
            "Command '/parent' requires a subcommand.",
          ),
        }),
        expect.any(Number),
      );
    });

    it('should correctly find and execute a nested subcommand', async () => {
      const childAction = vi.fn();
      const parentCommand: SlashCommand = {
        name: 'parent',
        description: 'a parent command',
        kind: 'built-in',
        subCommands: [
          {
            name: 'child',
            description: 'a child command',
            kind: 'built-in',
            action: childAction,
          },
        ],
      };
      const result = setupProcessorHook([parentCommand]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('/parent child with args');
      });

      expect(childAction).toHaveBeenCalledTimes(1);

      expect(childAction).toHaveBeenCalledWith(
        expect.objectContaining({
          services: expect.objectContaining({
            config: mockConfig,
          }),
          ui: expect.objectContaining({
            addItem: mockAddItem,
          }),
        }),
        'with args',
      );
    });
  });

  describe('Action Result Handling', () => {
    it('should handle "dialog: help" action', async () => {
      const command: SlashCommand = {
        name: 'helpcmd',
        description: 'a help command',
        kind: 'built-in',
        action: vi.fn().mockResolvedValue({ type: 'dialog', dialog: 'help' }),
      };
      const result = setupProcessorHook([command]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('/helpcmd');
      });

      expect(mockSetShowHelp).toHaveBeenCalledWith(true);
    });

    it('should handle "load_history" action', async () => {
      const command: SlashCommand = {
        name: 'load',
        description: 'a load command',
        kind: 'built-in',
        action: vi.fn().mockResolvedValue({
          type: 'load_history',
          history: [{ type: MessageType.USER, text: 'old prompt' }],
          clientHistory: [{ role: 'user', parts: [{ text: 'old prompt' }] }],
        }),
      };
      const result = setupProcessorHook([command]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('/load');
      });

      expect(mockClearItems).toHaveBeenCalledTimes(1);
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'user', text: 'old prompt' }),
        expect.any(Number),
      );
    });

    describe('with fake timers', () => {
      // This test needs to let the async `waitFor` complete with REAL timers
      // before switching to FAKE timers to test setTimeout.
      it('should handle a "quit" action', async () => {
        const quitAction = vi
          .fn()
          .mockResolvedValue({ type: 'quit', messages: [] });
        const command: SlashCommand = {
          name: 'exit',
          description: 'an exit command',
          kind: 'built-in',
          action: quitAction,
        };
        const result = setupProcessorHook([command]);

        await waitFor(() =>
          expect(result.current.slashCommands).toHaveLength(1),
        );

        vi.useFakeTimers();

        try {
          await act(async () => {
            await result.current.handleSlashCommand('/exit');
          });

          await act(async () => {
            await vi.advanceTimersByTimeAsync(200);
          });

          expect(mockSetQuittingMessages).toHaveBeenCalledWith([]);
          expect(mockProcessExit).toHaveBeenCalledWith(0);
        } finally {
          vi.useRealTimers();
        }
      });
    });
  });

  describe('Command Parsing and Matching', () => {
    it('should be case-sensitive', async () => {
      const command: SlashCommand = {
        name: 'test',
        description: 'a test command',
        kind: 'built-in',
      };
      const result = setupProcessorHook([command]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        // Use uppercase when command is lowercase
        await result.current.handleSlashCommand('/Test');
      });

      // It should fail and call addItem with an error
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Unknown command: /Test',
        }),
        expect.any(Number),
      );
    });

    it('should correctly match an altName', async () => {
      const action = vi.fn();
      const command: SlashCommand = {
        name: 'main',
        altNames: ['alias'],
        description: 'a command with an alias',
        kind: 'built-in',
        action,
      };
      const result = setupProcessorHook([command]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('/alias');
      });

      expect(action).toHaveBeenCalledTimes(1);
      expect(mockAddItem).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: MessageType.ERROR }),
      );
    });

    it('should handle extra whitespace around the command', async () => {
      const action = vi.fn();
      const command: SlashCommand = {
        name: 'test',
        description: 'a test command',
        kind: 'built-in',
        action,
      };
      const result = setupProcessorHook([command]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('  /test  with-args  ');
      });

      expect(action).toHaveBeenCalledWith(expect.anything(), 'with-args');
    });
  });

  describe('Lifecycle', () => {
    it('should abort command loading when the hook unmounts', async () => {
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
      const { unmount } = renderHook(() =>
        useSlashCommandProcessor(
          mockConfig,
          mockSettings,
          mockAddItem,
          mockClearItems,
          mockLoadHistory,
          vi.fn(), // refreshStatic
          mockSetShowHelp,
          vi.fn(), // onDebugMessage
          vi.fn(), // openThemeDialog
          mockOpenAuthDialog,
          vi.fn(), // openEditorDialog
          vi.fn(), // toggleCorgiMode
          mockSetQuittingMessages,
          vi.fn(), // openPrivacyNotice
        ),
      );

      unmount();

      expect(abortSpy).toHaveBeenCalledTimes(1);
    });
  });
});
