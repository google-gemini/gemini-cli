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
    cwd: vi.fn(() => '/mock/cwd'),
    get env() {
      return process.env;
    }, // Use a getter to ensure current process.env is used
    platform: 'test-platform',
    version: 'test-node-version',
    memoryUsage: vi.fn(() => ({
      rss: 12345678,
      heapTotal: 23456789,
      heapUsed: 10234567,
      external: 1234567,
      arrayBuffers: 123456,
    })),
  },
  // Provide top-level exports as well for compatibility
  exit: mockProcessExit,
  cwd: vi.fn(() => '/mock/cwd'),
  get env() {
    return process.env;
  }, // Use a getter here too
  platform: 'test-platform',
  version: 'test-node-version',
  memoryUsage: vi.fn(() => ({
    rss: 12345678,
    heapTotal: 23456789,
    heapUsed: 10234567,
    external: 1234567,
    arrayBuffers: 123456,
  })),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

const mockGetCliVersionFn = vi.fn(() => Promise.resolve('0.1.0'));
vi.mock('../../utils/version.js', () => ({
  getCliVersion: (...args: []) => mockGetCliVersionFn(...args),
}));

import { act, renderHook } from '@testing-library/react';
import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  Mock,
} from 'vitest';
import open from 'open';
import { useSlashCommandProcessor } from './slashCommandProcessor.js';
import { SlashCommandProcessorResult } from '../types.js';
import { Config, GeminiClient } from '@google/gemini-cli-core';
import { useSessionStats } from '../contexts/SessionContext.js';
import { LoadedSettings } from '../../config/settings.js';
import * as ShowMemoryCommandModule from './useShowMemoryCommand.js';
import { CommandService } from '../../services/CommandService.js';
import { SlashCommand } from '../commands/types.js';

vi.mock('../contexts/SessionContext.js', () => ({
  useSessionStats: vi.fn(),
}));

vi.mock('../../services/CommandService.js');

vi.mock('./useShowMemoryCommand.js', () => ({
  SHOW_MEMORY_COMMAND_NAME: '/memory show',
  createShowMemoryAction: vi.fn(() => vi.fn()),
}));

vi.mock('open', () => ({
  default: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
  };
});

describe('useSlashCommandProcessor', () => {
  let mockAddItem: ReturnType<typeof vi.fn>;
  let mockClearItems: ReturnType<typeof vi.fn>;
  let mockLoadHistory: ReturnType<typeof vi.fn>;
  let mockRefreshStatic: ReturnType<typeof vi.fn>;
  let mockSetShowHelp: ReturnType<typeof vi.fn>;
  let mockOnDebugMessage: ReturnType<typeof vi.fn>;
  let mockOpenThemeDialog: ReturnType<typeof vi.fn>;
  let mockOpenAuthDialog: ReturnType<typeof vi.fn>;
  let mockOpenEditorDialog: ReturnType<typeof vi.fn>;
  let mockSetQuittingMessages: ReturnType<typeof vi.fn>;
  let mockTryCompressChat: ReturnType<typeof vi.fn>;
  let mockGeminiClient: GeminiClient;
  let mockConfig: Config;
  let mockCorgiMode: ReturnType<typeof vi.fn>;
  const mockUseSessionStats = useSessionStats as Mock;

  beforeEach(() => {
    // Reset all mocks to clear any previous state or calls.
    vi.clearAllMocks();

    // Default mock setup for CommandService for all the OLD tests.
    // This makes them pass again by simulating the original behavior where
    // the service is constructed but doesn't do much yet.
    vi.mocked(CommandService).mockImplementation(
      () =>
        ({
          loadCommands: vi.fn().mockResolvedValue(undefined),
          getCommands: vi.fn().mockReturnValue([]), // Return an empty array by default
        }) as unknown as CommandService,
    );

    mockAddItem = vi.fn();
    mockClearItems = vi.fn();
    mockLoadHistory = vi.fn();
    mockRefreshStatic = vi.fn();
    mockSetShowHelp = vi.fn();
    mockOnDebugMessage = vi.fn();
    mockOpenThemeDialog = vi.fn();
    mockOpenAuthDialog = vi.fn();
    mockOpenEditorDialog = vi.fn();
    mockSetQuittingMessages = vi.fn();
    mockTryCompressChat = vi.fn();
    mockGeminiClient = {
      tryCompressChat: mockTryCompressChat,
    } as unknown as GeminiClient;
    mockConfig = {
      getDebugMode: vi.fn(() => false),
      getGeminiClient: () => mockGeminiClient,
      getSandbox: vi.fn(() => 'test-sandbox'),
      getModel: vi.fn(() => 'test-model'),
      getProjectRoot: vi.fn(() => '/test/dir'),
      getCheckpointingEnabled: vi.fn(() => true),
      getBugCommand: vi.fn(() => undefined),
      getSessionId: vi.fn(() => 'test-session-id'),
      getIdeMode: vi.fn(() => false),
    } as unknown as Config;
    mockCorgiMode = vi.fn();
    mockUseSessionStats.mockReturnValue({
      stats: {
        sessionStartTime: new Date('2025-01-01T00:00:00.000Z'),
        cumulative: {
          promptCount: 0,
          promptTokenCount: 0,
          candidatesTokenCount: 0,
          totalTokenCount: 0,
          cachedContentTokenCount: 0,
          toolUsePromptTokenCount: 0,
          thoughtsTokenCount: 0,
        },
      },
    });

    (open as Mock).mockClear();
    mockProcessExit.mockClear();
    (ShowMemoryCommandModule.createShowMemoryAction as Mock).mockClear();
    process.env = { ...globalThis.process.env };
  });

  const getProcessorHook = () => {
    const settings = {
      merged: {
        contextFileName: 'GEMINI.md',
      },
    } as unknown as LoadedSettings;
    return renderHook(() =>
      useSlashCommandProcessor(
        mockConfig,
        settings,
        [],
        mockAddItem,
        mockClearItems,
        mockLoadHistory,
        mockRefreshStatic,
        mockSetShowHelp,
        mockOnDebugMessage,
        mockOpenThemeDialog,
        mockOpenAuthDialog,
        mockOpenEditorDialog,
        mockCorgiMode,
        mockSetQuittingMessages,
        vi.fn(), // mockOpenPrivacyNotice
      ),
    );
  };

  const getProcessor = () => getProcessorHook().result.current;

  describe('New command registry', () => {
    let ActualCommandService: typeof CommandService;

    beforeAll(async () => {
      const actual = (await vi.importActual(
        '../../services/CommandService.js',
      )) as { CommandService: typeof CommandService };
      ActualCommandService = actual.CommandService;
    });

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should execute a command from the new registry', async () => {
      const mockAction = vi.fn();
      const newCommand: SlashCommand = { name: 'test', action: mockAction };
      const mockLoader = async () => [newCommand];

      // We create the instance outside the mock implementation.
      const commandServiceInstance = new ActualCommandService(
        mockConfig,
        mockLoader,
      );

      // This mock ensures the hook uses our pre-configured instance.
      vi.mocked(CommandService).mockImplementation(
        () => commandServiceInstance,
      );

      const { result } = getProcessorHook();

      await vi.waitFor(() => {
        // We check that the `slashCommands` array, which is the public API
        // of our hook, eventually contains the command we injected.
        expect(
          result.current.slashCommands.some((c) => c.name === 'test'),
        ).toBe(true);
      });

      let commandResult: SlashCommandProcessorResult | false = false;
      await act(async () => {
        commandResult = await result.current.handleSlashCommand('/test');
      });

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(commandResult).toEqual({ type: 'handled' });
    });

    it('should return "schedule_tool" when a new command returns a tool action', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        type: 'tool',
        toolName: 'my_tool',
        toolArgs: { arg1: 'value1' },
      });
      const newCommand: SlashCommand = { name: 'test', action: mockAction };
      const mockLoader = async () => [newCommand];
      const commandServiceInstance = new ActualCommandService(
        mockConfig,
        mockLoader,
      );
      vi.mocked(CommandService).mockImplementation(
        () => commandServiceInstance,
      );

      const { result } = getProcessorHook();
      await vi.waitFor(() => {
        expect(
          result.current.slashCommands.some((c) => c.name === 'test'),
        ).toBe(true);
      });

      const commandResult = await result.current.handleSlashCommand('/test');

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(commandResult).toEqual({
        type: 'schedule_tool',
        toolName: 'my_tool',
        toolArgs: { arg1: 'value1' },
      });
    });

    it('should return "handled" when a new command returns a message action', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        type: 'message',
        messageType: 'info',
        content: 'This is a message',
      });
      const newCommand: SlashCommand = { name: 'test', action: mockAction };
      const mockLoader = async () => [newCommand];
      const commandServiceInstance = new ActualCommandService(
        mockConfig,
        mockLoader,
      );
      vi.mocked(CommandService).mockImplementation(
        () => commandServiceInstance,
      );

      const { result } = getProcessorHook();
      await vi.waitFor(() => {
        expect(
          result.current.slashCommands.some((c) => c.name === 'test'),
        ).toBe(true);
      });

      const commandResult = await result.current.handleSlashCommand('/test');

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: 'This is a message',
        }),
        expect.any(Number),
      );
      expect(commandResult).toEqual({ type: 'handled' });
    });

    it('should return "handled" when a new command returns a dialog action', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        type: 'dialog',
        dialog: 'help',
      });
      const newCommand: SlashCommand = { name: 'test', action: mockAction };
      const mockLoader = async () => [newCommand];
      const commandServiceInstance = new ActualCommandService(
        mockConfig,
        mockLoader,
      );
      vi.mocked(CommandService).mockImplementation(
        () => commandServiceInstance,
      );

      const { result } = getProcessorHook();
      await vi.waitFor(() => {
        expect(
          result.current.slashCommands.some((c) => c.name === 'test'),
        ).toBe(true);
      });

      const commandResult = await result.current.handleSlashCommand('/test');

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(mockSetShowHelp).toHaveBeenCalledWith(true);
      expect(commandResult).toEqual({ type: 'handled' });
    });

    it('should open the auth dialog when a new command returns an auth dialog action', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        type: 'dialog',
        dialog: 'auth',
      });
      const newAuthCommand: SlashCommand = { name: 'auth', action: mockAction };

      const mockLoader = async () => [newAuthCommand];
      const commandServiceInstance = new ActualCommandService(
        mockConfig,
        mockLoader,
      );
      vi.mocked(CommandService).mockImplementation(
        () => commandServiceInstance,
      );

      const { result } = getProcessorHook();
      await vi.waitFor(() => {
        expect(
          result.current.slashCommands.some((c) => c.name === 'auth'),
        ).toBe(true);
      });

      const commandResult = await result.current.handleSlashCommand('/auth');

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(mockOpenAuthDialog).toHaveBeenCalledWith();
      expect(commandResult).toEqual({ type: 'handled' });
    });

    it('should open the theme dialog when a new command returns a theme dialog action', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        type: 'dialog',
        dialog: 'theme',
      });
      const newCommand: SlashCommand = { name: 'test', action: mockAction };
      const mockLoader = async () => [newCommand];
      const commandServiceInstance = new ActualCommandService(
        mockConfig,
        mockLoader,
      );
      vi.mocked(CommandService).mockImplementation(
        () => commandServiceInstance,
      );

      const { result } = getProcessorHook();
      await vi.waitFor(() => {
        expect(
          result.current.slashCommands.some((c) => c.name === 'test'),
        ).toBe(true);
      });

      const commandResult = await result.current.handleSlashCommand('/test');

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(mockOpenThemeDialog).toHaveBeenCalledWith();
      expect(commandResult).toEqual({ type: 'handled' });
    });

    it('should show help for a parent command with no action', async () => {
      const parentCommand: SlashCommand = {
        name: 'parent',
        subCommands: [
          { name: 'child', description: 'A child.', action: vi.fn() },
        ],
      };

      const mockLoader = async () => [parentCommand];
      const commandServiceInstance = new ActualCommandService(
        mockConfig,
        mockLoader,
      );
      vi.mocked(CommandService).mockImplementation(
        () => commandServiceInstance,
      );

      const { result } = getProcessorHook();

      await vi.waitFor(() => {
        expect(
          result.current.slashCommands.some((c) => c.name === 'parent'),
        ).toBe(true);
      });

      await act(async () => {
        await result.current.handleSlashCommand('/parent');
      });

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: expect.stringContaining(
            "Command '/parent' requires a subcommand.",
          ),
        }),
        expect.any(Number),
      );
    });
  });

  describe('/quit and /exit commands', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([['/quit'], ['/exit']])(
      'should handle %s, set quitting messages, and exit the process',
      async (command) => {
        const { handleSlashCommand } = getProcessor();
        const mockDate = new Date('2025-01-01T01:02:03.000Z');
        vi.setSystemTime(mockDate);

        await act(async () => {
          handleSlashCommand(command);
        });

        expect(mockAddItem).not.toHaveBeenCalled();
        expect(mockSetQuittingMessages).toHaveBeenCalledWith([
          {
            type: 'user',
            text: command,
            id: expect.any(Number),
          },
          {
            type: 'quit',
            duration: '1h 2m 3s',
            id: expect.any(Number),
          },
        ]);

        // Fast-forward timers to trigger process.exit
        await act(async () => {
          vi.advanceTimersByTime(100);
        });
        expect(mockProcessExit).toHaveBeenCalledWith(0);
      },
    );
  });
});
