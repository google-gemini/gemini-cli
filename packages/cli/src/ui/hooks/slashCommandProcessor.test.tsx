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
import type {
  CommandContext,
  ConfirmShellCommandsActionReturn,
  SlashCommand,
} from '../commands/types.js';
import { CommandKind } from '../commands/types.js';
import type { LoadedSettings } from '../../config/settings.js';
import { MessageType, type SlashCommandProcessorResult } from '../types.js';
import { BuiltinCommandLoader } from '../../services/BuiltinCommandLoader.js';
import { FileCommandLoader } from '../../services/FileCommandLoader.js';
import { McpPromptLoader } from '../../services/McpPromptLoader.js';
import {
  type GeminiClient,
  SlashCommandStatus,
  ToolConfirmationOutcome,
  makeFakeConfig,
} from '@google/gemini-cli-core';

const { logSlashCommand } = vi.hoisted(() => ({
  logSlashCommand: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();

  return {
    ...original,
    logSlashCommand,
    getIdeInstaller: vi.fn().mockReturnValue(null),
    IdeClient: {
      getInstance: vi.fn().mockResolvedValue({
        addStatusChangeListener: vi.fn(),
        removeStatusChangeListener: vi.fn(),
      }),
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
  } as unknown as NodeJS.Process;
  return {
    ...mockProcess,
    default: mockProcess,
  };
});

const mockBuiltinLoadCommands = vi.fn();
vi.mock('../../services/BuiltinCommandLoader.js', () => ({
  BuiltinCommandLoader: vi.fn().mockImplementation(() => ({
    loadCommands: mockBuiltinLoadCommands,
  })),
}));

const mockFileLoadCommands = vi.fn();
vi.mock('../../services/FileCommandLoader.js', () => ({
  FileCommandLoader: vi.fn().mockImplementation(() => ({
    loadCommands: mockFileLoadCommands,
  })),
}));

const mockMcpLoadCommands = vi.fn();
vi.mock('../../services/McpPromptLoader.js', () => ({
  McpPromptLoader: vi.fn().mockImplementation(() => ({
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
  });

  afterEach(async () => {
    if (unmountHook) {
      await unmountHook();
      unmountHook = undefined;
    }
  });

  const setupProcessorHook = async (
    builtinCommands: SlashCommand[] = [],
    fileCommands: SlashCommand[] = [],
    mcpCommands: SlashCommand[] = [],
    setIsProcessing = vi.fn(),
  ) => {
    mockBuiltinLoadCommands.mockResolvedValue(Object.freeze(builtinCommands));
    mockFileLoadCommands.mockResolvedValue(Object.freeze(fileCommands));
    mockMcpLoadCommands.mockResolvedValue(Object.freeze(mcpCommands));

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
          vi.fn(), // refreshStatic
          vi.fn(), // toggleVimEnabled
          setIsProcessing,
          vi.fn(), // setGeminiMdFileCount
          {
            openAuthDialog: mockOpenAuthDialog,
            openThemeDialog: mockOpenThemeDialog,
            openEditorDialog: vi.fn(),
            openPrivacyNotice: vi.fn(),
            openSettingsDialog: vi.fn(),
            openModelDialog: mockOpenModelDialog,
            openPermissionsDialog: vi.fn(),
            quit: mockSetQuittingMessages,
            setDebugMessage: vi.fn(),
            toggleCorgiMode: vi.fn(),
            toggleDebugProfiler: vi.fn(),
            dispatchExtensionStateUpdate: vi.fn(),
            addConfirmUpdateExtensionRequest: vi.fn(),
          },
          new Map(), // extensionsUpdateState
          true, // isConfigInitialized
        ),
      );
      result = hook.result;
      unmount = hook.unmount;
      rerender = hook.rerender;
    });

    unmountHook = async () => unmount();

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

  describe('Initialization and Command Loading', () => {
    it('should initialize CommandService with all required loaders', async () => {
      await setupProcessorHook();
      expect(BuiltinCommandLoader).toHaveBeenCalledWith(mockConfig);
      expect(FileCommandLoader).toHaveBeenCalledWith(mockConfig);
      expect(McpPromptLoader).toHaveBeenCalledWith(mockConfig);
    });

    it('should call loadCommands and populate state after mounting', async () => {
      const testCommand = createTestCommand({ name: 'test' });
      const result = await setupProcessorHook([testCommand]);

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
      const result = await setupProcessorHook([testCommand]);

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

      const result = await setupProcessorHook([builtinCommand], [fileCommand]);

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
    it('should display an error for an unknown command', async () => {
      const result = await setupProcessorHook();
      await waitFor(() => expect(result.current.slashCommands).toBeDefined());

      await act(async () => {
        await result.current.handleSlashCommand('/nonexistent');
      });

      // Expect 2 calls: one for the user's input, one for the error message.
      expect(mockAddItem).toHaveBeenCalledTimes(2);
      expect(mockAddItem).toHaveBeenLastCalledWith(
        {
          type: MessageType.ERROR,
          text: expect.stringContaining('Unknown command'),
        },
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
      const result = await setupProcessorHook([parentCommand]);
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
      const result = await setupProcessorHook([parentCommand]);
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
      const result = await setupProcessorHook([], [], [], setMockIsProcessing);

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

      const result = await setupProcessorHook(
        [failCommand],
        [],
        [],
        setMockIsProcessing,
      );

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

      const result = await setupProcessorHook(
        [command],
        [],
        [],
        mockSetIsProcessing,
      );
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
    it.each([
      {
        dialogType: 'theme' as const,
        commandName: 'themecmd',
        mockToAssert: mockOpenThemeDialog,
      },
      {
        dialogType: 'model' as const,
        commandName: 'modelcmd',
        mockToAssert: mockOpenModelDialog,
      },
    ])(
      'should handle "dialog: $dialogType" action',
      async ({ dialogType, commandName, mockToAssert }) => {
        const command = createTestCommand({
          name: commandName,
          action: vi
            .fn()
            .mockResolvedValue({ type: 'dialog', dialog: dialogType }),
        });
        const result = setupProcessorHook([command]);
        await vi.waitFor(() =>
          expect(result.current.slashCommands).toHaveLength(1),
        );

        await act(async () => {
          await result.current.handleSlashCommand(`/${commandName}`);
        });

        expect(mockToAssert).toHaveBeenCalled();
      },
    );

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
      const result = await setupProcessorHook([command]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('/load');
      });

      expect(mockClearItems).toHaveBeenCalledTimes(1);
      expect(mockAddItem).toHaveBeenCalledWith(
        { type: 'user', text: expect.stringContaining('old prompt') },
        expect.any(Number),
      );
    });

    it('should strip thoughts when handling "load_history" action', async () => {
      const mockClient = {
        setHistory: vi.fn(),
        stripThoughtsFromHistory: vi.fn(),
      } as unknown as GeminiClient;
      vi.spyOn(mockConfig, 'getGeminiClient').mockReturnValue(mockClient);

      const historyWithThoughts = [
        {
          role: 'model',
          parts: [{ text: 'response', thoughtSignature: 'CikB...' }],
        },
      ];
      const command = createTestCommand({
        name: 'loadwiththoughts',
        action: vi.fn().mockResolvedValue({
          type: 'load_history',
          history: [{ type: MessageType.GEMINI, text: 'response' }],
          clientHistory: historyWithThoughts,
        }),
      });

      const result = await setupProcessorHook([command]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('/loadwiththoughts');
      });

      expect(mockClient.setHistory).toHaveBeenCalledTimes(1);
      expect(mockClient.stripThoughtsFromHistory).toHaveBeenCalledWith();
    });

    it('should handle a "quit" action', async () => {
      const quitAction = vi
        .fn()
        .mockResolvedValue({ type: 'quit', messages: ['bye'] });
      const command = createTestCommand({
        name: 'exit',
        action: quitAction,
      });
      const result = await setupProcessorHook([command]);

      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('/exit');
      });

      expect(mockSetQuittingMessages).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('bye')]),
      );
    });
    it.each([
      {
        kind: CommandKind.FILE,
        name: 'filecmd',
        description: 'A command from a file',
        prompt: 'The actual prompt from the TOML file.',
        setupHook: (command: SlashCommand) => setupProcessorHook([], [command]),
      },
      {
        kind: CommandKind.MCP_PROMPT,
        name: 'mcpcmd',
        description: 'A command from mcp',
        prompt: 'The actual prompt from the mcp command.',
        setupHook: (command: SlashCommand) =>
          setupProcessorHook([], [], [command]),
      },
    ])(
      'should handle "submit_prompt" action from a $kind command',
      async ({ kind, name, description, prompt, setupHook }) => {
        const command = createTestCommand(
          {
            name,
            description,
            action: async () => ({
              type: 'submit_prompt',
              content: [{ text: prompt }],
            }),
          },
          kind,
        );

        const result = setupHook(command);
        await vi.waitFor(() =>
          expect(result.current.slashCommands).toHaveLength(1),
        );

        let actionResult;
        await act(async () => {
          actionResult = await result.current.handleSlashCommand(`/${name}`);
        });

        expect(actionResult).toEqual({
          type: 'submit_prompt',
          content: [{ text: prompt }],
        });

        expect(mockAddItem).toHaveBeenCalledWith(
          { type: MessageType.USER, text: `/${name}` },
          expect.any(Number),
        );
      },
    );
  });

  describe('Shell Command Confirmation Flow', () => {
    // Use a generic vi.fn() for the action. We will change its behavior in each test.
    const mockCommandAction = vi.fn();

    const shellCommand = createTestCommand({
      name: 'shellcmd',
      action: mockCommandAction,
    });

    beforeEach(() => {
      // Reset the mock before each test
      mockCommandAction.mockClear();

      // Default behavior: request confirmation
      mockCommandAction.mockResolvedValue({
        type: 'confirm_shell_commands',
        commandsToConfirm: ['rm -rf /'],
        originalInvocation: { raw: '/shellcmd' },
      } as ConfirmShellCommandsActionReturn);
    });

    it('should set confirmation request when action returns confirm_shell_commands', async () => {
      const result = await setupProcessorHook([shellCommand]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      // Trigger command, don't await it yet as it suspends for confirmation
      await act(async () => {
        void result.current.handleSlashCommand('/shellcmd');
      });

      // We now wait for the state to be updated with the request.
      await act(async () => {
        await waitFor(() => {
          expect(result.current.shellConfirmationRequest).not.toBeNull();
        });
      });

      expect(result.current.shellConfirmationRequest?.commands).toEqual([
        'rm -rf /',
      ]);
    });

    it('should do nothing if user cancels confirmation', async () => {
      const result = await setupProcessorHook([shellCommand]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        void result.current.handleSlashCommand('/shellcmd');
      });

      // Wait for the confirmation dialog to be set
      await act(async () => {
        await waitFor(() => {
          expect(result.current.shellConfirmationRequest).not.toBeNull();
        });
      });

      const onConfirm = result.current.shellConfirmationRequest?.onConfirm;
      expect(onConfirm).toBeDefined();

      // Change the mock action's behavior for a potential second run.
      // If the test is flawed, this will be called, and we can detect it.
      mockCommandAction.mockResolvedValue({
        type: 'message',
        messageType: 'info',
        content: 'This should not be called',
      });

      await act(async () => {
        onConfirm!(ToolConfirmationOutcome.Cancel, []); // Pass empty array for safety
      });

      expect(result.current.shellConfirmationRequest).toBeNull();
      // Verify the action was only called the initial time.
      expect(mockCommandAction).toHaveBeenCalledTimes(1);
    });

    it('should re-run command with one-time allowlist on "Proceed Once"', async () => {
      const result = await setupProcessorHook([shellCommand]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      let commandPromise:
        | Promise<false | SlashCommandProcessorResult>
        | undefined;
      await act(async () => {
        commandPromise = result.current.handleSlashCommand('/shellcmd');
      });
      await act(async () => {
        await waitFor(() => {
          expect(result.current.shellConfirmationRequest).not.toBeNull();
        });
      });

      const onConfirm = result.current.shellConfirmationRequest?.onConfirm;

      // **Change the mock's behavior for the SECOND run.**
      // This is the key to testing the outcome.
      mockCommandAction.mockResolvedValue({
        type: 'message',
        messageType: 'info',
        content: 'Success!',
      });

      await act(async () => {
        onConfirm!(ToolConfirmationOutcome.ProceedOnce, ['rm -rf /']);
      });

      await act(async () => {
        await commandPromise;
      });

      expect(result.current.shellConfirmationRequest).toBeNull();

      // The action should have been called twice (initial + re-run).
      await waitFor(() => {
        expect(mockCommandAction).toHaveBeenCalledTimes(2);
      });

      // We can inspect the context of the second call to ensure the one-time list was used.
      const secondCallContext = mockCommandAction.mock
        .calls[1][0] as CommandContext;
      expect(
        secondCallContext.session.sessionShellAllowlist.has('rm -rf /'),
      ).toBe(true);

      // Verify the final success message was added.
      expect(mockAddItem).toHaveBeenCalledWith(
        { type: MessageType.INFO, text: expect.stringContaining('Success') },
        expect.any(Number),
      );

      // Verify the session-wide allowlist was NOT permanently updated.
      // Re-render the hook by calling a no-op command to get the latest context.
      await act(async () => {
        await result.current.handleSlashCommand('/no-op');
      });
      const finalContext = result.current.commandContext;
      expect(finalContext.session.sessionShellAllowlist.size).toBe(0);
    });

    it('should re-run command and update session allowlist on "Proceed Always"', async () => {
      const result = await setupProcessorHook([shellCommand]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      let commandPromise:
        | Promise<false | SlashCommandProcessorResult>
        | undefined;
      await act(async () => {
        commandPromise = result.current.handleSlashCommand('/shellcmd');
      });
      await act(async () => {
        await waitFor(() => {
          expect(result.current.shellConfirmationRequest).not.toBeNull();
        });
      });

      const onConfirm = result.current.shellConfirmationRequest?.onConfirm;
      mockCommandAction.mockResolvedValue({
        type: 'message',
        messageType: 'info',
        content: 'Success!',
      });

      await act(async () => {
        onConfirm!(ToolConfirmationOutcome.ProceedAlways, ['rm -rf /']);
      });

      await act(async () => {
        await commandPromise;
      });

      expect(result.current.shellConfirmationRequest).toBeNull();
      await waitFor(() => {
        expect(mockCommandAction).toHaveBeenCalledTimes(2);
      });

      expect(mockAddItem).toHaveBeenCalledWith(
        { type: MessageType.INFO, text: 'Success!' },
        expect.any(Number),
      );

      // Check that the session-wide allowlist WAS updated.
      await waitFor(() => {
        const finalContext = result.current.commandContext;
        expect(finalContext.session.sessionShellAllowlist.has('rm -rf /')).toBe(
          true,
        );
      });
    });
  });

  describe('Command Parsing and Matching', () => {
    it.each([
      {
        description: 'should be case-sensitive and fail',
        commandToRun: '/Test',
        command: createTestCommand({ name: 'test' }),
        shouldFail: true,
      },
      {
        description: 'should correctly match an altName',
        commandToRun: '/alias',
        command: createTestCommand({
          name: 'main',
          altNames: ['alias'],
          action: vi.fn(),
        }),
        shouldFail: false,
      },
      {
        description: 'should handle extra whitespace around the command',
        commandToRun: '  /test  with-args  ',
        command: createTestCommand({ name: 'test', action: vi.fn() }),
        shouldFail: false,
        expectedArgs: 'with-args',
      },
      {
        description: 'should handle `?` as a command prefix',
        commandToRun: '?help',
        command: createTestCommand({ name: 'help', action: vi.fn() }),
        shouldFail: false,
      },
    ])(
      '$description',
      async ({ commandToRun, command, shouldFail, expectedArgs }) => {
        const result = setupProcessorHook([command]);
        await vi.waitFor(() =>
          expect(result.current.slashCommands).toHaveLength(1),
        );

        await act(async () => {
          await result.current.handleSlashCommand(commandToRun);
        });

        if (shouldFail) {
          expect(mockAddItem).toHaveBeenCalledWith(
            {
              type: MessageType.ERROR,
              text: expect.stringContaining('Unknown command'),
            },
            expect.any(Number),
          );
          if (command.action) {
            expect(command.action).not.toHaveBeenCalled();
          }
        } else {
          expect(mockAddItem).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: MessageType.ERROR }),
          );
          if (command.action) {
            expect(command.action).toHaveBeenCalledTimes(1);
            if (expectedArgs) {
              expect(command.action).toHaveBeenCalledWith(
                expect.anything(),
                expectedArgs,
              );
            }
          }
        }
      },
    );
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

      const result = await setupProcessorHook([], [fileCommand], [mcpCommand]);

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
      const result = await setupProcessorHook([quitCommand], [exitCommand]);

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

      const result = await setupProcessorHook([quitCommand], [exitCommand]);
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
    const loggingTestCommands: SlashCommand[] = [
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

    beforeEach(() => {
      mockCommandAction.mockClear();
      vi.mocked(logSlashCommand).mockClear();
    });

    it.each([
      {
        description: 'should log a simple slash command',
        commandToRun: '/logtest',
        shouldCallLogger: true,
        expectedPayload: {
          command: 'logtest',
          subcommand: undefined,
          status: SlashCommandStatus.SUCCESS,
        },
      },
      {
        description: 'logs nothing for a bogus command',
        commandToRun: '/bogusbogusbogus',
        shouldCallLogger: false,
      },
      {
        description: 'logs a failure event for a failed command',
        commandToRun: '/fail',
        shouldCallLogger: true,
        expectedPayload: {
          command: 'fail',
          status: 'error',
          subcommand: undefined,
        },
      },
      {
        description: 'should log a slash command with a subcommand',
        commandToRun: '/logwithsub sub',
        shouldCallLogger: true,
        expectedPayload: {
          command: 'logwithsub',
          subcommand: 'sub',
        },
      },
      {
        description: 'should log the command path when an alias is used',
        commandToRun: '/la',
        shouldCallLogger: true,
        expectedPayload: {
          command: 'logalias',
        },
      },
      {
        description: 'should not log for unknown commands',
        commandToRun: '/unknown',
        shouldCallLogger: false,
      },
    ])(
      '$description',
      async ({ commandToRun, shouldCallLogger, expectedPayload }) => {
        const result = setupProcessorHook(loggingTestCommands);
        await vi.waitFor(() =>
          expect(result.current.slashCommands?.length).toBeGreaterThan(0),
        );
        await act(async () => {
          await result.current.handleSlashCommand(commandToRun);
        });

        if (shouldCallLogger) {
          expect(logSlashCommand).toHaveBeenCalledWith(
            mockConfig,
            expect.objectContaining(expectedPayload),
          );
        } else {
          expect(logSlashCommand).not.toHaveBeenCalled();
        }
      },
    );
  });
});
