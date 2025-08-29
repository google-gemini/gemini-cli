/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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

import { act, renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { useSlashCommandProcessor } from './slashCommandProcessor.js';
import type {
  CommandContext,
  ConfirmShellCommandsActionReturn,
  SlashCommand,
} from '../commands/types.js';
import { CommandKind } from '../commands/types.js';
import type { LoadedSettings } from '../../config/settings.js';
import { MessageType } from '../types.js';
import { BuiltinCommandLoader } from '../../services/BuiltinCommandLoader.js';
import { FileCommandLoader } from '../../services/FileCommandLoader.js';
import { McpPromptLoader } from '../../services/McpPromptLoader.js';
import {
  SlashCommandStatus,
  ToolConfirmationOutcome,
  makeFakeConfig,
  ToolConfirmationOutcome,
  type IdeClient,
} from '@google/gemini-cli-core';

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
  const mockSetQuittingMessages = vi.fn();

  const mockConfig = makeFakeConfig({});
  vi.spyOn(mockConfig, 'getIdeClient').mockReturnValue({
    addStatusChangeListener: vi.fn(),
    removeStatusChangeListener: vi.fn(),
  } as unknown as IdeClient);

  const mockSettings = {} as LoadedSettings;

  beforeEach(() => {
    vi.clearAllMocks();
    (vi.mocked(BuiltinCommandLoader) as Mock).mockClear();
    mockBuiltinLoadCommands.mockResolvedValue([]);
    mockFileLoadCommands.mockResolvedValue([]);
    mockMcpLoadCommands.mockResolvedValue([]);
  });

  const setupProcessorHook = (
    builtinCommands: SlashCommand[] = [],
    fileCommands: SlashCommand[] = [],
    mcpCommands: SlashCommand[] = [],
    setIsProcessing = vi.fn(),
  ) => {
    mockBuiltinLoadCommands.mockResolvedValue(Object.freeze(builtinCommands));
    mockFileLoadCommands.mockResolvedValue(Object.freeze(fileCommands));
    mockMcpLoadCommands.mockResolvedValue(Object.freeze(mcpCommands));

    const { result } = renderHook(() =>
      useSlashCommandProcessor(
        mockConfig,
        mockSettings,
        mockAddItem,
        mockClearItems,
        mockLoadHistory,
        vi.fn(), // refreshStatic
        vi.fn(), // onDebugMessage
        mockOpenThemeDialog, // openThemeDialog
        mockOpenAuthDialog,
        vi.fn(), // openEditorDialog
        vi.fn(), // toggleCorgiMode
        mockSetQuittingMessages,
        vi.fn(), // openPrivacyNotice
        vi.fn(), // openSettingsDialog
        vi.fn(), // toggleVimEnabled
        setIsProcessing,
      ),
    );

    return result;
  };

  describe('Initialization and Command Loading', () => {
    it('should initialize CommandService with all required loaders', () => {
      setupProcessorHook();
      expect(BuiltinCommandLoader).toHaveBeenCalledWith(mockConfig);
      expect(FileCommandLoader).toHaveBeenCalledWith(mockConfig);
      expect(McpPromptLoader).toHaveBeenCalledWith(mockConfig);
    });

    it('should call loadCommands and populate state after mounting', async () => {
      const testCommand = createTestCommand({ name: 'test' });
      const result = setupProcessorHook([testCommand]);

      await waitFor(() => {
        expect(result.current.slashCommands).toHaveLength(1);
      });

      expect(result.current.slashCommands[0]?.name).toBe('test');
      expect(mockBuiltinLoadCommands).toHaveBeenCalledTimes(1);
      expect(mockFileLoadCommands).toHaveBeenCalledTimes(1);
      expect(mockMcpLoadCommands).toHaveBeenCalledTimes(1);
    });

    it('should provide an immutable array of commands to consumers', async () => {
      const testCommand = createTestCommand({ name: 'test' });
      const result = setupProcessorHook([testCommand]);

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

      const result = setupProcessorHook([builtinCommand], [fileCommand]);

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
      const result = setupProcessorHook();
      await waitFor(() => expect(result.current.slashCommands).toBeDefined());

      await act(async () => {
        await result.current.handleSlashCommand('/nonexistent');
      });

      // Expect 2 calls: one for the user's input, one for the error message.
      expect(mockAddItem).toHaveBeenCalledTimes(2);
      expect(mockAddItem).toHaveBeenLastCalledWith(
        {
          type: MessageType.ERROR,
          text: 'Unknown command: /nonexistent',
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
      const result = setupProcessorHook([parentCommand]);
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

    it('sets isProcessing to false if the the input is not a command', async () => {
      const setMockIsProcessing = vi.fn();
      const result = setupProcessorHook([], [], [], setMockIsProcessing);

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

      const result = setupProcessorHook(
        [failCommand],
        [],
        [],
        setMockIsProcessing,
      );

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

      const result = setupProcessorHook([command], [], [], mockSetIsProcessing);
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
    it('should handle "dialog: theme" action', async () => {
      const command = createTestCommand({
        name: 'themecmd',
        action: vi.fn().mockResolvedValue({ type: 'dialog', dialog: 'theme' }),
      });
      const result = setupProcessorHook([command]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('/themecmd');
      });

      expect(mockOpenThemeDialog).toHaveBeenCalled();
    });

    it('should handle "load_history" action', async () => {
      const command = createTestCommand({
        name: 'load',
        action: vi.fn().mockResolvedValue({
          type: 'load_history',
          history: [{ type: MessageType.USER, text: 'old prompt' }],
          clientHistory: [{ role: 'user', parts: [{ text: 'old prompt' }] }],
        }),
      });
      const result = setupProcessorHook([command]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('/load');
      });

      expect(mockClearItems).toHaveBeenCalledTimes(1);
      expect(mockAddItem).toHaveBeenCalledWith(
        { type: 'user', text: 'old prompt' },
        expect.any(Number),
      );
    });

    it('should strip thoughts when handling "load_history" action', async () => {
      const mockSetHistory = vi.fn();
      const mockGeminiClient = {
        setHistory: mockSetHistory,
      };
      vi.spyOn(mockConfig, 'getGeminiClient').mockReturnValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockGeminiClient as any,
      );

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
          history: [{ type: MessageType.MODEL, text: 'response' }],
          clientHistory: historyWithThoughts,
        }),
      });

      const result = setupProcessorHook([command]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('/loadwiththoughts');
      });

      expect(mockSetHistory).toHaveBeenCalledTimes(1);
      expect(mockSetHistory).toHaveBeenCalledWith(historyWithThoughts, {
        stripThoughts: true,
      });
    });

    describe('with fake timers', () => {
      // This test needs to let the async `waitFor` complete with REAL timers
      // before switching to FAKE timers to test setTimeout.
      it('should handle a "quit" action', async () => {
        const quitAction = vi
          .fn()
          .mockResolvedValue({ type: 'quit', messages: [] });
        const command = createTestCommand({
          name: 'exit',
          action: quitAction,
        });
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

      it('should call runExitCleanup when handling a "quit" action', async () => {
        const quitAction = vi
          .fn()
          .mockResolvedValue({ type: 'quit', messages: [] });
        const command = createTestCommand({
          name: 'exit',
          action: quitAction,
        });
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

          expect(mockRunExitCleanup).toHaveBeenCalledTimes(1);
        } finally {
          vi.useRealTimers();
        }
      });
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

      const result = setupProcessorHook([], [fileCommand]);
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

      const result = setupProcessorHook([], [], [mcpCommand]);
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
      const result = setupProcessorHook([shellCommand]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      // This is intentionally not awaited, because the promise it returns
      // will not resolve until the user responds to the confirmation.
      act(() => {
        result.current.handleSlashCommand('/shellcmd');
      });

      // We now wait for the state to be updated with the request.
      await waitFor(() => {
        expect(result.current.shellConfirmationRequest).not.toBeNull();
      });

      expect(result.current.shellConfirmationRequest?.commands).toEqual([
        'rm -rf /',
      ]);
    });

    it('should do nothing if user cancels confirmation', async () => {
      const result = setupProcessorHook([shellCommand]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      act(() => {
        result.current.handleSlashCommand('/shellcmd');
      });

      // Wait for the confirmation dialog to be set
      await waitFor(() => {
        expect(result.current.shellConfirmationRequest).not.toBeNull();
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
      const result = setupProcessorHook([shellCommand]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      act(() => {
        result.current.handleSlashCommand('/shellcmd');
      });
      await waitFor(() => {
        expect(result.current.shellConfirmationRequest).not.toBeNull();
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
        { type: MessageType.INFO, text: 'Success!' },
        expect.any(Number),
      );

      // Verify the session-wide allowlist was NOT permanently updated.
      // Re-render the hook by calling a no-op command to get the latest context.
      await act(async () => {
        result.current.handleSlashCommand('/no-op');
      });
      const finalContext = result.current.commandContext;
      expect(finalContext.session.sessionShellAllowlist.size).toBe(0);
    });

    it('should re-run command and update session allowlist on "Proceed Always"', async () => {
      const result = setupProcessorHook([shellCommand]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      act(() => {
        result.current.handleSlashCommand('/shellcmd');
      });
      await waitFor(() => {
        expect(result.current.shellConfirmationRequest).not.toBeNull();
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
    it('should be case-sensitive', async () => {
      const command = createTestCommand({ name: 'test' });
      const result = setupProcessorHook([command]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        // Use uppercase when command is lowercase
        await result.current.handleSlashCommand('/Test');
      });

      // It should fail and call addItem with an error
      expect(mockAddItem).toHaveBeenCalledWith(
        {
          type: MessageType.ERROR,
          text: 'Unknown command: /Test',
        },
        expect.any(Number),
      );
    });

    it('should correctly match an altName', async () => {
      const action = vi.fn();
      const command = createTestCommand({
        name: 'main',
        altNames: ['alias'],
        description: 'a command with an alias',
        action,
      });
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
      const command = createTestCommand({ name: 'test', action });
      const result = setupProcessorHook([command]);
      await waitFor(() => expect(result.current.slashCommands).toHaveLength(1));

      await act(async () => {
        await result.current.handleSlashCommand('  /test  with-args  ');
      });

      expect(action).toHaveBeenCalledWith(expect.anything(), 'with-args');
    });

    it('should handle `?` as a command prefix', async () => {
      const action = vi.fn();
      const command = createTestCommand({ name: 'help', action });
      const result = setupProcessorHook([command]);
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

      const result = setupProcessorHook([], [fileCommand], [mcpCommand]);

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
      const result = setupProcessorHook([quitCommand], [exitCommand]);

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

      const result = setupProcessorHook([quitCommand], [exitCommand]);
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
    it('should abort command loading when the hook unmounts', () => {
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
      const { unmount } = renderHook(() =>
        useSlashCommandProcessor(
          mockConfig,
          mockSettings,
          mockAddItem,
          mockClearItems,
          mockLoadHistory,
          vi.fn(), // refreshStatic
          vi.fn(), // onDebugMessage
          vi.fn(), // openThemeDialog
          mockOpenAuthDialog,
          vi.fn(), // openEditorDialog
          vi.fn(), // toggleCorgiMode
          mockSetQuittingMessages,
          vi.fn(), // openPrivacyNotice

          vi.fn(), // openSettingsDialog
          vi.fn(), // toggleVimEnabled
          vi.fn().mockResolvedValue(false), // toggleVimEnabled
          vi.fn(), // setIsProcessing
        ),
      );

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

    it('should log a simple slash command', async () => {
      const result = setupProcessorHook(loggingTestCommands);
      await waitFor(() =>
        expect(result.current.slashCommands.length).toBeGreaterThan(0),
      );
      await act(async () => {
        await result.current.handleSlashCommand('/logtest');
      });

      expect(logSlashCommand).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          command: 'logtest',
          subcommand: undefined,
          status: SlashCommandStatus.SUCCESS,
        }),
      );
    });

    it('logs nothing for a bogus command', async () => {
      const result = setupProcessorHook(loggingTestCommands);
      await waitFor(() =>
        expect(result.current.slashCommands.length).toBeGreaterThan(0),
      );
      await act(async () => {
        await result.current.handleSlashCommand('/bogusbogusbogus');
      });

      expect(logSlashCommand).not.toHaveBeenCalled();
    });

    it('logs a failure event for a failed command', async () => {
      const result = setupProcessorHook(loggingTestCommands);
      await waitFor(() =>
        expect(result.current.slashCommands.length).toBeGreaterThan(0),
      );
      await act(async () => {
        await result.current.handleSlashCommand('/fail');
      });

      expect(logSlashCommand).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          command: 'fail',
          status: 'error',
          subcommand: undefined,
        }),
      );
    });

    it('should log a slash command with a subcommand', async () => {
      const result = setupProcessorHook(loggingTestCommands);
      await waitFor(() =>
        expect(result.current.slashCommands.length).toBeGreaterThan(0),
      );
      await act(async () => {
        await result.current.handleSlashCommand('/logwithsub sub');
      });

      expect(logSlashCommand).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          command: 'logwithsub',
          subcommand: 'sub',
        }),
      );
    });

    it('should log the command path when an alias is used', async () => {
      const result = setupProcessorHook(loggingTestCommands);
      await waitFor(() =>
        expect(result.current.slashCommands.length).toBeGreaterThan(0),
      );
      await act(async () => {
        await result.current.handleSlashCommand('/la');
      });
      expect(logSlashCommand).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          command: 'logalias',
        }),
      );
    });

    it('should not log for unknown commands', async () => {
      const result = setupProcessorHook(loggingTestCommands);
      await waitFor(() =>
        expect(result.current.slashCommands.length).toBeGreaterThan(0),
      );
      await act(async () => {
        await result.current.handleSlashCommand('/unknown');
      });
      expect(logSlashCommand).not.toHaveBeenCalled();
    });
  });
});
