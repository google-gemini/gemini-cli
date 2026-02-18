/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { useSlashCommandProcessor } from './slashCommandProcessor.js';
import type { SlashCommand } from '../commands/types.js';
import { CommandKind } from '../commands/types.js';
import type { LoadedSettings } from '../../config/settings.js';
import { MessageType } from '../types.js';
import { BuiltinCommandLoader } from '../../services/BuiltinCommandLoader.js';
import { FileCommandLoader } from '../../services/FileCommandLoader.js';
import { McpPromptLoader } from '../../services/McpPromptLoader.js';
import {
  type GeminiClient,
  type UserFeedbackPayload,
  SlashCommandStatus,
  MCPDiscoveryState,
  makeFakeConfig,
  coreEvents,
  CoreEvent,
} from '@google/gemini-cli-core';
import { SlashCommandConflictHandler } from '../../services/SlashCommandConflictHandler.js';

const {
  logSlashCommand,
  mockBuiltinLoadCommands,
  mockFileLoadCommands,
  mockMcpLoadCommands,
  mockIdeClientGetInstance,
  mockUseAlternateBuffer,
} = vi.hoisted(() => ({
  logSlashCommand: vi.fn(),
  mockBuiltinLoadCommands: vi.fn().mockResolvedValue([]),
  mockFileLoadCommands: vi.fn().mockResolvedValue([]),
  mockMcpLoadCommands: vi.fn().mockResolvedValue([]),
  mockIdeClientGetInstance: vi.fn().mockResolvedValue({
    addStatusChangeListener: vi.fn(),
    removeStatusChangeListener: vi.fn(),
  }),
  mockUseAlternateBuffer: vi.fn().mockReturnValue(false),
}));

vi.mock('./useAlternateBuffer.js', () => ({
  useAlternateBuffer: mockUseAlternateBuffer,
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();

  return {
    ...original,
    logSlashCommand,
    getIdeInstaller: vi.fn().mockReturnValue(null),
    IdeClient: {
      getInstance: mockIdeClientGetInstance,
    },
  };
});

const { mockProcessExit } = vi.hoisted(() => ({
  mockProcessExit: vi.fn((_code?: number): never => undefined as never),
}));

vi.mock('node:process', () => {
  const mockProcess: Partial<NodeJS.Process> = {
    exit: mockProcessExit,
    platform: 'sunos',
    cwd: () => '/fake/dir',
    env: {},
  } as unknown as NodeJS.Process;
  return {
    ...mockProcess,
    default: mockProcess,
  };
});

vi.mock('../../services/BuiltinCommandLoader.js', () => ({
  BuiltinCommandLoader: vi.fn(() => ({
    loadCommands: mockBuiltinLoadCommands,
  })),
}));

vi.mock('../../services/FileCommandLoader.js', () => ({
  FileCommandLoader: vi.fn(() => ({
    loadCommands: mockFileLoadCommands,
  })),
}));

vi.mock('../../services/McpPromptLoader.js', () => ({
  McpPromptLoader: vi.fn(() => ({
    loadCommands: mockMcpLoadCommands,
  })),
}));

vi.mock('../contexts/SessionContext.js', () => ({
  useSessionStats: vi.fn(() => ({ stats: {} })),
}));

const { mockRunExitCleanup } = vi.hoisted(() => ({
  mockRunExitCleanup: vi.fn(),
}));

vi.mock('../../utils/cleanup.js', () => ({
  runExitCleanup: mockRunExitCleanup,
}));

function createTestCommand(
  overrides: Partial<SlashCommand>,
  kind: CommandKind = CommandKind.BUILT_IN,
): SlashCommand {
  return {
    name: 'test',
    description: 'a test command',
    kind,
    ...overrides,
  };
}

describe('useSlashCommandProcessor', () => {
  const mockAddItem = vi.fn();
  const mockClearItems = vi.fn();
  const mockLoadHistory = vi.fn();
  const mockOpenThemeDialog = vi.fn();
  const mockOpenAuthDialog = vi.fn();
  const mockOpenModelDialog = vi.fn();
  const mockSetQuittingMessages = vi.fn();

  const mockConfig = makeFakeConfig({});
  const mockSettings = {} as LoadedSettings;

  let unmountHook: (() => Promise<void>) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(BuiltinCommandLoader).mockClear();
    mockBuiltinLoadCommands.mockResolvedValue([]);
    mockFileLoadCommands.mockResolvedValue([]);
    mockMcpLoadCommands.mockResolvedValue([]);
    mockUseAlternateBuffer.mockReturnValue(false);
    mockIdeClientGetInstance.mockResolvedValue({
      addStatusChangeListener: vi.fn(),
      removeStatusChangeListener: vi.fn(),
    });
    vi.spyOn(console, 'clear').mockImplementation(() => {});
  });

  afterEach(async () => {
    if (unmountHook) {
      await unmountHook();
      unmountHook = undefined;
    }
    vi.restoreAllMocks();
  });

  const setupProcessorHook = async (
    options: {
      builtinCommands?: SlashCommand[];
      fileCommands?: SlashCommand[];
      mcpCommands?: SlashCommand[];
      setIsProcessing?: (isProcessing: boolean) => void;
      refreshStatic?: () => void;
      openAgentConfigDialog?: (
        name: string,
        displayName: string,
        definition: unknown,
      ) => void;
    } = {},
  ) => {
    const {
      builtinCommands = [],
      fileCommands = [],
      mcpCommands = [],
      setIsProcessing = vi.fn(),
      refreshStatic = vi.fn(),
      openAgentConfigDialog = vi.fn(),
    } = options;

    mockBuiltinLoadCommands.mockResolvedValue(Object.freeze(builtinCommands));
    mockFileLoadCommands.mockResolvedValue(Object.freeze(fileCommands));
    mockMcpLoadCommands.mockResolvedValue(Object.freeze(mcpCommands));

    const conflictHandler = new SlashCommandConflictHandler();
    conflictHandler.start();

    const handleFeedback = (payload: UserFeedbackPayload) => {
      let type = MessageType.INFO;
      if (payload.severity === 'error') {
        type = MessageType.ERROR;
      } else if (payload.severity === 'warning') {
        type = MessageType.WARNING;
      }
      mockAddItem(
        {
          type,
          text: payload.message,
        },
        Date.now(),
      );
    };
    coreEvents.on(CoreEvent.UserFeedback, handleFeedback);

    let result!: { current: ReturnType<typeof useSlashCommandProcessor> };
    let unmount!: () => void;
    let rerender!: (props?: unknown) => void;

    await act(async () => {
      const hook = renderHook(() =>
        useSlashCommandProcessor(
          mockConfig,
          mockSettings,
          mockAddItem,
          mockClearItems,
          mockLoadHistory,
          refreshStatic,
          vi.fn(), // toggleVimEnabled
          setIsProcessing,
          {
            openAuthDialog: mockOpenAuthDialog,
            openThemeDialog: mockOpenThemeDialog,
            openEditorDialog: vi.fn(),
            openPrivacyNotice: vi.fn(),
            openSettingsDialog: vi.fn(),
            openSessionBrowser: vi.fn(),
            openModelDialog: mockOpenModelDialog,
            openAgentConfigDialog,
            openPermissionsDialog: vi.fn(),
            quit: mockSetQuittingMessages,
            setDebugMessage: vi.fn(),
            toggleCorgiMode: vi.fn(),
            toggleDebugProfiler: vi.fn(),
            dispatchExtensionStateUpdate: vi.fn(),
            addConfirmUpdateExtensionRequest: vi.fn(),
            toggleBackgroundShell: vi.fn(),
            toggleShortcutsHelp: vi.fn(),
            setText: vi.fn(),
          },
          new Map(), // extensionsUpdateState
          true, // isConfigInitialized
          vi.fn(), // setBannerVisible
          vi.fn(), // setCustomDialog
        ),
      );
      result = hook.result;
      unmount = hook.unmount;
      rerender = hook.rerender;
    });

    unmountHook = async () => {
      conflictHandler.stop();
      coreEvents.off(CoreEvent.UserFeedback, handleFeedback);
      unmount();
    };

    await waitFor(() => {
      expect(result.current.slashCommands).toBeDefined();
    });

    return {
      get current() {
        return result.current;
      },
      unmount,
      rerender: async () => {
        rerender();
      },
    };
  };

  describe('Console Clear Safety', () => {
    it('should not call console.clear if alternate buffer is active', async () => {
      mockUseAlternateBuffer.mockReturnValue(true);
      const clearCommand = createTestCommand({
        name: 'clear',
        action: async (context) => {
          context.ui.clear();
        },
      });
      const result = await setupProcessorHook({
        builtinCommands: [clearCommand],
      });

      await act(async () => {
        await result.current.handleSlashCommand('/clear');
      });

      expect(mockClearItems).toHaveBeenCalled();
    });

    it('should call console.clear if alternate buffer is not active', async () => {
      mockUseAlternateBuffer.mockReturnValue(false);
      const clearCommand = createTestCommand({
        name: 'clear',
        action: async (context) => {
          context.ui.clear();
        },
      });
      const result = await setupProcessorHook({
        builtinCommands: [clearCommand],
      });

      await act(async () => {
        await result.current.handleSlashCommand('/clear');
      });

      expect(mockClearItems).toHaveBeenCalled();
    });
  });

  describe('Initialization and Command Loading', () => {
    it('should initialize CommandService with all required loaders', async () => {
      await setupProcessorHook();
      expect(BuiltinCommandLoader).toHaveBeenCalledWith(mockConfig);
      expect(FileCommandLoader).toHaveBeenCalledWith(mockConfig);
      expect(McpPromptLoader).toHaveBeenCalledWith(mockConfig);
    });

    it('should call loadCommands and populate state after mounting', async () => {
      const testCommand = createTestCommand({ name: 'test' });
      const result = await setupProcessorHook({
        builtinCommands: [testCommand],
      });

      await waitFor(() => {
        expect(result.current.slashCommands).toHaveLength(1);
      });

      expect(result.current.slashCommands?.[0]?.name).toBe('test');
      expect(mockBuiltinLoadCommands).toHaveBeenCalledTimes(1);
      expect(mockFileLoadCommands).toHaveBeenCalledTimes(1);
      expect(mockMcpLoadCommands).toHaveBeenCalledTimes(1);
    });

    it('should provide an immutable array of commands to consumers', async () => {
      const testCommand = createTestCommand({ name: 'test' });
      const result = await setupProcessorHook({
        builtinCommands: [testCommand],
      });

      await waitFor(() => {
        expect(result.current.slashCommands).toHaveLength(1);
      });

      const commands = result.current.slashCommands;

      expect(() => {
        // @ts-expect-error - We are intentionally testing a violation of the readonly type.
        commands.push(createTestCommand({ name: 'rogue' }));
      }).toThrow(TypeError);
    });

    it('should override built-in commands with file-based commands of the same name', async () => {
      const builtinAction = vi.fn();
      const fileAction = vi.fn();

      const builtinCommand = createTestCommand({
        name: 'override',
        description: 'builtin',
        action: builtinAction,
      });
      const fileCommand = createTestCommand(
        { name: 'override', description: 'file', action: fileAction },
        CommandKind.FILE,
      );

      const result = await setupProcessorHook({
        builtinCommands: [builtinCommand],
        fileCommands: [fileCommand],
      });

      await waitFor(() => {
        // The service should only return one command with the name 'override'
        expect(result.current.slashCommands).toHaveLength(1);
      });

      await act(async () => {
        await result.current.handleSlashCommand('/override');
      });

      // Only the file-based command's action should be called.
      expect(fileAction).toHaveBeenCalledTimes(1);
      expect(builtinAction).not.toHaveBeenCalled();
    });
  });

  describe('Command Execution Logic', () => {
    it('should treat unknown commands as regular input', async () => {
      const result = await setupProcessorHook();
      await waitFor(() => expect(result.current.slashCommands).toBeDefined());

      let handled: Awaited<
        ReturnType<typeof result.current.handleSlashCommand>
      >;
      await act(async () => {
        handled = await result.current.handleSlashCommand('/nonexistent');
      });

      // Unknown commands should return false so the input is sent to the model
      expect(handled!).toBe(false);
      // Should not add anything to history (the regular flow will handle it)
      expect(mockAddItem).not.toHaveBeenCalled();
    });

    it('should show MCP loading warning for unknown commands when MCP is loading', async () => {
      vi.spyOn(mockConfig, 'getMcpClientManager').mockReturnValue({
        getDiscoveryState: () => MCPDiscoveryState.IN_PROGRESS,
      } as ReturnType<typeof mockConfig.getMcpClientManager>);

      const result = await setupProcessorHook();
      await waitFor(() => expect(result.current.slashCommands).toBeDefined());

      let handled: Awaited<
        ReturnType<typeof result.current.handleSlashCommand>
      >;
      await act(async () => {
        handled = await result.current.handleSlashCommand('/mcp-command');
      });

      // When MCP is loading, should handle the command (show warning)
      expect(handled!).not.toBe(false);
      // Should add user input and error message to history
      expect(mockAddItem).toHaveBeenCalledWith(
        { type: MessageType.USER, text: '/mcp-command' },
        expect.any(Number),
      );
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
        }),
        expect.any(Number),
      );
    });

    it('should display help for a parent command invoked without a subcommand', async () => {
      const parentCommand: SlashCommand = {
        name: 'parent',
        description: 'a parent command',
        kind: CommandKind.BUILT_IN,
        subCommands: [
          {
            name: 'child1',
            description: 'First child.',
            kind: CommandKind.BUILT_IN,
          },
        ],
      };
      const result = await setupProcessorHook({
        builtinCommands: [parentCommand],
      });
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('/parent');
      });

      expect(mockAddItem).toHaveBeenCalledTimes(2);
      expect(mockAddItem).toHaveBeenLastCalledWith(
        {
          type: MessageType.INFO,
          text: expect.stringContaining(
            "Command '/parent' requires a subcommand.",
          ),
        },
        expect.any(Number),
      );
    });

    it('should correctly find and execute a nested subcommand', async () => {
      const childAction = vi.fn();
      const parentCommand: SlashCommand = {
        name: 'parent',
        description: 'a parent command',
        kind: CommandKind.BUILT_IN,
        subCommands: [
          {
            name: 'child',
            description: 'a child command',
            kind: CommandKind.BUILT_IN,
            action: childAction,
          },
        ],
      };
      const result = await setupProcessorHook({
        builtinCommands: [parentCommand],
      });
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

    it('sets isProcessing to false if the the input is not a command', async () => {
      const setMockIsProcessing = vi.fn();
      const result = await setupProcessorHook({
        setIsProcessing: setMockIsProcessing,
      });

      await act(async () => {
        await result.current.handleSlashCommand('imnotacommand');
      });

      expect(setMockIsProcessing).not.toHaveBeenCalled();
    });

    it('sets isProcessing to false if the command has an error', async () => {
      const setMockIsProcessing = vi.fn();
      const failCommand = createTestCommand({
        name: 'fail',
        action: vi.fn().mockRejectedValue(new Error('oh no!')),
      });

      const result = await setupProcessorHook({
        builtinCommands: [failCommand],
        setIsProcessing: setMockIsProcessing,
      });

      await waitFor(() => expect(result.current.slashCommands).toBeDefined());

      await act(async () => {
        await result.current.handleSlashCommand('/fail');
      });

      expect(setMockIsProcessing).toHaveBeenNthCalledWith(1, true);
      expect(setMockIsProcessing).toHaveBeenNthCalledWith(2, false);
    });

    it('should set isProcessing to true during execution and false afterwards', async () => {
      const mockSetIsProcessing = vi.fn();
      const command = createTestCommand({
        name: 'long-running',
        action: () => new Promise((resolve) => setTimeout(resolve, 50)),
      });

      const result = await setupProcessorHook({
        builtinCommands: [command],
        setIsProcessing: mockSetIsProcessing,
      });
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      const executionPromise = act(async () => {
        await result.current.handleSlashCommand('/long-running');
      });

      // It should be true immediately after starting
      expect(mockSetIsProcessing).toHaveBeenNthCalledWith(1, true);
      // It should not have been called with false yet
      expect(mockSetIsProcessing).not.toHaveBeenCalledWith(false);

      await executionPromise;

      // After the promise resolves, it should be called with false
      expect(mockSetIsProcessing).toHaveBeenNthCalledWith(2, false);
      expect(mockSetIsProcessing).toHaveBeenCalledTimes(2);
    });
  });

  describe('Action Result Handling', () => {
    describe('Dialog actions', () => {
      it.each([
        {
          dialogType: 'theme',
          commandName: 'themecmd',
          mockFn: mockOpenThemeDialog,
        },
        {
          dialogType: 'model',
          commandName: 'modelcmd',
          mockFn: mockOpenModelDialog,
        },
      ])(
        'should handle "dialog: $dialogType" action',
        async ({ dialogType, commandName, mockFn }) => {
          const command = createTestCommand({
            name: commandName,
            action: vi
              .fn()
              .mockResolvedValue({ type: 'dialog', dialog: dialogType }),
          });
          const result = await setupProcessorHook({
            builtinCommands: [command],
          });
          await waitFor(() =>
            expect(result.current.slashCommands).toHaveLength(1),
          );

          await act(async () => {
            await result.current.handleSlashCommand(`/${commandName}`);
          });

          expect(mockFn).toHaveBeenCalled();
        },
      );

      it('should handle "dialog: agentConfig" action with props', async () => {
        const mockOpenAgentConfigDialog = vi.fn();
        const agentDefinition = { name: 'test-agent' };
        const commandName = 'agentconfigcmd';
        const command = createTestCommand({
          name: commandName,
          action: vi.fn().mockResolvedValue({
            type: 'dialog',
            dialog: 'agentConfig',
            props: {
              name: 'test-agent',
              displayName: 'Test Agent',
              definition: agentDefinition,
            },
          }),
        });

        const result = await setupProcessorHook({
          builtinCommands: [command],
          openAgentConfigDialog: mockOpenAgentConfigDialog,
        });

        await waitFor(() =>
          expect(result.current.slashCommands).toHaveLength(1),
        );

        await act(async () => {
          await result.current.handleSlashCommand(`/${commandName}`);
        });

        expect(mockOpenAgentConfigDialog).toHaveBeenCalledWith(
          'test-agent',
          'Test Agent',
          agentDefinition,
        );
      });
    });

    it('should handle "load_history" action', async () => {
      const mockClient = {
        setHistory: vi.fn(),
        stripThoughtsFromHistory: vi.fn(),
      } as unknown as GeminiClient;
      vi.spyOn(mockConfig, 'getGeminiClient').mockReturnValue(mockClient);

      const command = createTestCommand({
        name: 'load',
        action: vi.fn().mockResolvedValue({
          type: 'load_history',
          history: [{ type: MessageType.USER, text: 'old prompt' }],
          clientHistory: [{ role: 'user', parts: [{ text: 'old prompt' }] }],
        }),
      });

      const mockRefreshStatic = vi.fn();
      const result = await setupProcessorHook({
        builtinCommands: [command],
        refreshStatic: mockRefreshStatic,
      });

      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('/load');
      });

      // ui.clear() is called which calls refreshStatic()
      expect(mockClearItems).toHaveBeenCalledTimes(1);
      expect(mockRefreshStatic).toHaveBeenCalledTimes(1);
      expect(mockAddItem).toHaveBeenCalledWith(
        { type: 'user', text: 'old prompt' },
        expect.any(Number),
      );
    });

    it('should call refreshStatic exactly once when ui.loadHistory is called', async () => {
      const mockRefreshStatic = vi.fn();
      const result = await setupProcessorHook({
        refreshStatic: mockRefreshStatic,
      });

      await act(async () => {
        result.current.commandContext.ui.loadHistory([]);
      });

      expect(mockLoadHistory).toHaveBeenCalled();
      expect(mockRefreshStatic).toHaveBeenCalledTimes(1);
    });

    it('should handle a "quit" action', async () => {
      const quitAction = vi
        .fn()
        .mockResolvedValue({ type: 'quit', messages: ['bye'] });
      const command = createTestCommand({
        name: 'exit',
        action: quitAction,
      });
      const result = await setupProcessorHook({
        builtinCommands: [command],
      });

      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('/exit');
      });

      expect(mockSetQuittingMessages).toHaveBeenCalledWith(['bye']);
    });
    it('should handle "submit_prompt" action returned from a file-based command', async () => {
      const fileCommand = createTestCommand(
        {
          name: 'filecmd',
          description: 'A command from a file',
          action: async () => ({
            type: 'submit_prompt',
            content: [{ text: 'The actual prompt from the TOML file.' }],
          }),
        },
        CommandKind.FILE,
      );

      const result = await setupProcessorHook({
        fileCommands: [fileCommand],
      });
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      let actionResult;
      await act(async () => {
        actionResult = await result.current.handleSlashCommand('/filecmd');
      });

      expect(actionResult).toEqual({
        type: 'submit_prompt',
        content: [{ text: 'The actual prompt from the TOML file.' }],
      });

      expect(mockAddItem).toHaveBeenCalledWith(
        { type: MessageType.USER, text: '/filecmd' },
        expect.any(Number),
      );
    });

    it('should handle "submit_prompt" action returned from a mcp-based command', async () => {
      const mcpCommand = createTestCommand(
        {
          name: 'mcpcmd',
          description: 'A command from mcp',
          action: async () => ({
            type: 'submit_prompt',
            content: [{ text: 'The actual prompt from the mcp command.' }],
          }),
        },
        CommandKind.MCP_PROMPT,
      );

      const result = await setupProcessorHook({
        mcpCommands: [mcpCommand],
      });
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      let actionResult;
      await act(async () => {
        actionResult = await result.current.handleSlashCommand('/mcpcmd');
      });

      expect(actionResult).toEqual({
        type: 'submit_prompt',
        content: [{ text: 'The actual prompt from the mcp command.' }],
      });

      expect(mockAddItem).toHaveBeenCalledWith(
        { type: MessageType.USER, text: '/mcpcmd' },
        expect.any(Number),
      );
    });
  });

  describe('Command Parsing and Matching', () => {
    it('should be case-sensitive', async () => {
      const command = createTestCommand({ name: 'test' });
      const result = await setupProcessorHook({
        builtinCommands: [command],
      });
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      let handled: Awaited<
        ReturnType<typeof result.current.handleSlashCommand>
      >;
      await act(async () => {
        // Use uppercase when command is lowercase
        handled = await result.current.handleSlashCommand('/Test');
      });

      // Case mismatch means it's not a known command, so treat as regular input
      expect(handled!).toBe(false);
      expect(mockAddItem).not.toHaveBeenCalled();
    });

    it('should correctly match an altName', async () => {
      const action = vi.fn();
      const command = createTestCommand({
        name: 'main',
        altNames: ['alias'],
        description: 'a command with an alias',
        action,
      });
      const result = await setupProcessorHook({
        builtinCommands: [command],
      });
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
      const command = createTestCommand({ name: 'test', action });
      const result = await setupProcessorHook({
        builtinCommands: [command],
      });
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('  /test  with-args  ');
      });

      expect(action).toHaveBeenCalledWith(expect.anything(), 'with-args');
    });

    it('should handle `?` as a command prefix', async () => {
      const action = vi.fn();
      const command = createTestCommand({ name: 'help', action });
      const result = await setupProcessorHook({
        builtinCommands: [command],
      });
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('?help');
      });

      expect(action).toHaveBeenCalledTimes(1);
    });
  });

  describe('Command Precedence', () => {
    it('should override mcp-based commands with file-based commands of the same name', async () => {
      const mcpAction = vi.fn();
      const fileAction = vi.fn();

      const mcpCommand = createTestCommand(
        {
          name: 'override',
          description: 'mcp',
          action: mcpAction,
        },
        CommandKind.MCP_PROMPT,
      );
      const fileCommand = createTestCommand(
        { name: 'override', description: 'file', action: fileAction },
        CommandKind.FILE,
      );

      const result = await setupProcessorHook({
        fileCommands: [fileCommand],
        mcpCommands: [mcpCommand],
      });

      await waitFor(() => {
        // The service should only return one command with the name 'override'
        expect(result.current.slashCommands).toHaveLength(1);
      });

      await act(async () => {
        await result.current.handleSlashCommand('/override');
      });

      // Only the file-based command's action should be called.
      expect(fileAction).toHaveBeenCalledTimes(1);
      expect(mcpAction).not.toHaveBeenCalled();
    });

    it('should prioritize a command with a primary name over a command with a matching alias', async () => {
      const quitAction = vi.fn();
      const exitAction = vi.fn();

      const quitCommand = createTestCommand({
        name: 'quit',
        altNames: ['exit'],
        action: quitAction,
      });

      const exitCommand = createTestCommand(
        {
          name: 'exit',
          action: exitAction,
        },
        CommandKind.FILE,
      );

      // The order of commands in the final loaded array is not guaranteed,
      // so the test must work regardless of which comes first.
      const result = await setupProcessorHook({
        builtinCommands: [quitCommand],
        fileCommands: [exitCommand],
      });

      await waitFor(() => {
        expect(result.current.slashCommands).toHaveLength(2);
      });

      await act(async () => {
        await result.current.handleSlashCommand('/exit');
      });

      // The action for the command whose primary name is 'exit' should be called.
      expect(exitAction).toHaveBeenCalledTimes(1);
      // The action for the command that has 'exit' as an alias should NOT be called.
      expect(quitAction).not.toHaveBeenCalled();
    });

    it('should add an overridden command to the history', async () => {
      const quitCommand = createTestCommand({
        name: 'quit',
        altNames: ['exit'],
        action: vi.fn(),
      });
      const exitCommand = createTestCommand(
        { name: 'exit', action: vi.fn() },
        CommandKind.FILE,
      );

      const result = await setupProcessorHook({
        builtinCommands: [quitCommand],
        fileCommands: [exitCommand],
      });
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(2));

      await act(async () => {
        await result.current.handleSlashCommand('/exit');
      });

      // It should be added to the history.
      expect(mockAddItem).toHaveBeenCalledWith(
        { type: MessageType.USER, text: '/exit' },
        expect.any(Number),
      );
    });
  });

  describe('Lifecycle', () => {
    it('should abort command loading when the hook unmounts', async () => {
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
      const { unmount } = await setupProcessorHook();

      unmount();

      expect(abortSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Slash Command Logging', () => {
    const mockCommandAction = vi.fn().mockResolvedValue({ type: 'handled' });
    let loggingTestCommands: SlashCommand[];

    beforeEach(() => {
      mockCommandAction.mockClear();
      vi.mocked(logSlashCommand).mockClear();
      loggingTestCommands = [
        createTestCommand({
          name: 'logtest',
          action: vi
            .fn()
            .mockResolvedValue({ type: 'message', content: 'hello world' }),
        }),
        createTestCommand({
          name: 'logwithsub',
          subCommands: [
            createTestCommand({
              name: 'sub',
              action: mockCommandAction,
            }),
          ],
        }),
        createTestCommand({
          name: 'fail',
          action: vi.fn().mockRejectedValue(new Error('oh no!')),
        }),
        createTestCommand({
          name: 'logalias',
          altNames: ['la'],
          action: mockCommandAction,
        }),
      ];
    });

    it.each([
      {
        command: '/logtest',
        expectedLog: {
          command: 'logtest',
          subcommand: undefined,
          status: SlashCommandStatus.SUCCESS,
        },
        desc: 'simple slash command',
      },
      {
        command: '/fail',
        expectedLog: {
          command: 'fail',
          status: SlashCommandStatus.ERROR,
          subcommand: undefined,
        },
        desc: 'failure event for failed command',
      },
      {
        command: '/logwithsub sub',
        expectedLog: {
          command: 'logwithsub',
          subcommand: 'sub',
        },
        desc: 'slash command with subcommand',
      },
      {
        command: '/la',
        expectedLog: {
          command: 'logalias',
        },
        desc: 'command path when alias is used',
      },
    ])('should log $desc', async ({ command, expectedLog }) => {
      const result = await setupProcessorHook({
        builtinCommands: loggingTestCommands,
      });
      await waitFor(() => expect(result.current.slashCommands).toBeDefined());

      await act(async () => {
        await result.current.handleSlashCommand(command);
      });

      await waitFor(() => {
        expect(logSlashCommand).toHaveBeenCalledWith(
          mockConfig,
          expect.objectContaining(expectedLog),
        );
      });
    });

    it.each([
      { command: '/bogusbogusbogus', desc: 'bogus command' },
      { command: '/unknown', desc: 'unknown command' },
    ])('should not log for $desc', async ({ command }) => {
      const result = await setupProcessorHook({
        builtinCommands: loggingTestCommands,
      });
      await waitFor(() => expect(result.current.slashCommands).toBeDefined());

      await act(async () => {
        await result.current.handleSlashCommand(command);
      });

      expect(logSlashCommand).not.toHaveBeenCalled();
    });
  });

  it('should reload commands on extension events', async () => {
    const result = await setupProcessorHook();
    await waitFor(() => expect(result.current.slashCommands).toEqual([]));

    // Create a new command and make that the result of the fileLoadCommands
    // (which is where extension commands come from)
    const newCommand = createTestCommand({
      name: 'someNewCommand',
      action: vi.fn(),
    });
    mockFileLoadCommands.mockResolvedValue([newCommand]);

    // We should not see a change until we fire an event.
    await waitFor(() => expect(result.current.slashCommands).toEqual([]));
    act(() => {
      coreEvents.emit('extensionsStarting');
    });
    await waitFor(() =>
      expect(result.current.slashCommands).toEqual([newCommand]),
    );
  });

  describe('Conflict Notifications', () => {
    it('should display a warning when a command conflict occurs', async () => {
      const builtinCommand = createTestCommand({ name: 'deploy' });
      const extensionCommand = createTestCommand(
        {
          name: 'deploy',
          extensionName: 'firebase',
        },
        CommandKind.FILE,
      );

      const result = await setupProcessorHook({
        builtinCommands: [builtinCommand],
        fileCommands: [extensionCommand],
      });

      await waitFor(() => expect(result.current.slashCommands).toHaveLength(2));

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Command conflicts detected'),
        }),
        expect.any(Number),
      );

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining(
            "- Command '/deploy' from extension 'firebase' was renamed",
          ),
        }),
        expect.any(Number),
      );
    });

    it('should deduplicate conflict warnings across re-renders', async () => {
      const builtinCommand = createTestCommand({ name: 'deploy' });
      const extensionCommand = createTestCommand(
        {
          name: 'deploy',
          extensionName: 'firebase',
        },
        CommandKind.FILE,
      );

      const result = await setupProcessorHook({
        builtinCommands: [builtinCommand],
        fileCommands: [extensionCommand],
      });

      await waitFor(() => expect(result.current.slashCommands).toHaveLength(2));

      // First notification
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Command conflicts detected'),
        }),
        expect.any(Number),
      );

      mockAddItem.mockClear();

      // Trigger a reload or re-render
      await act(async () => {
        result.current.commandContext.ui.reloadCommands();
      });

      // Wait a bit for effect to run
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should NOT have notified again
      expect(mockAddItem).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Command conflicts detected'),
        }),
        expect.any(Number),
      );
    });

    it('should correctly identify the winner extension in the message', async () => {
      const ext1Command = createTestCommand(
        {
          name: 'deploy',
          extensionName: 'firebase',
        },
        CommandKind.FILE,
      );
      const ext2Command = createTestCommand(
        {
          name: 'deploy',
          extensionName: 'aws',
        },
        CommandKind.FILE,
      );

      const result = await setupProcessorHook({
        fileCommands: [ext1Command, ext2Command],
      });

      await waitFor(() => expect(result.current.slashCommands).toHaveLength(2));

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining("conflicts with extension 'firebase'"),
        }),
        expect.any(Number),
      );
    });
  });
});
