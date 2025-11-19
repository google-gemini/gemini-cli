/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handleSlashCommand } from './nonInteractiveCliCommands.js';
import * as commandsModule from './utils/commands.js';
import { FatalInputError } from '@google/gemini-cli-core';
import type { Config } from '@google/gemini-cli-core';
import { CommandService } from './services/CommandService.js';
import type { LoadedSettings } from './config/settings.js';
import type { Command } from './ui/commands/types.js';

vi.mock('./utils/commands.js');
vi.mock('./services/CommandService.js');
vi.mock('./ui/noninteractive/nonInteractiveUi.js', () => ({
  createNonInteractiveUI: vi.fn(() => ({})),
}));

describe('nonInteractiveCliCommands', () => {
  let mockConfig: Config;
  let mockSettings: LoadedSettings;
  let mockAbortController: AbortController;

  beforeEach(() => {
    mockConfig = {
      getSessionId: vi.fn(() => 'test-session-123'),
      storage: {} as never,
    } as unknown as Config;

    mockSettings = {} as LoadedSettings;

    mockAbortController = new AbortController();

    vi.clearAllMocks();
  });

  describe('handleSlashCommand', () => {
    it('should return undefined for non-slash commands', async () => {
      const result = await handleSlashCommand(
        'regular query',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(result).toBeUndefined();
    });

    it('should return undefined for empty string', async () => {
      const result = await handleSlashCommand(
        '',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(result).toBeUndefined();
    });

    it('should return undefined for whitespace only', async () => {
      const result = await handleSlashCommand(
        '   ',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(result).toBeUndefined();
    });

    it('should trim input before checking slash', async () => {
      const result = await handleSlashCommand(
        '  not a slash command  ',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(result).toBeUndefined();
    });

    it('should process slash commands', async () => {
      const mockCommand: Command = {
        name: 'test',
        description: 'Test command',
        action: vi.fn(),
      };

      const mockCommandService = {
        getCommands: vi.fn(() => [mockCommand]),
      };

      vi.mocked(CommandService.create).mockResolvedValue(
        mockCommandService as never,
      );

      vi.mocked(commandsModule.parseSlashCommand).mockReturnValue({
        commandToExecute: mockCommand,
        args: [],
      });

      await handleSlashCommand(
        '/test',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(commandsModule.parseSlashCommand).toHaveBeenCalledWith('/test', [
        mockCommand,
      ]);
    });

    it('should create CommandService with correct loaders', async () => {
      const mockCommandService = {
        getCommands: vi.fn(() => []),
      };

      vi.mocked(CommandService.create).mockResolvedValue(
        mockCommandService as never,
      );

      vi.mocked(commandsModule.parseSlashCommand).mockReturnValue({
        commandToExecute: undefined,
        args: [],
      });

      await handleSlashCommand(
        '/test',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(CommandService.create).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(Object)]),
        mockAbortController.signal,
      );
    });

    it('should execute command action when found', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        type: 'submit_prompt',
        content: 'test content',
      });

      const mockCommand: Command = {
        name: 'test',
        description: 'Test command',
        action: mockAction,
      };

      const mockCommandService = {
        getCommands: vi.fn(() => [mockCommand]),
      };

      vi.mocked(CommandService.create).mockResolvedValue(
        mockCommandService as never,
      );

      vi.mocked(commandsModule.parseSlashCommand).mockReturnValue({
        commandToExecute: mockCommand,
        args: ['arg1', 'arg2'],
      });

      await handleSlashCommand(
        '/test arg1 arg2',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(mockAction).toHaveBeenCalledWith(
        expect.objectContaining({
          services: expect.objectContaining({
            config: mockConfig,
            settings: mockSettings,
          }),
          invocation: expect.objectContaining({
            name: 'test',
            args: ['arg1', 'arg2'],
          }),
        }),
        ['arg1', 'arg2'],
      );
    });

    it('should return content for submit_prompt result', async () => {
      const promptContent = 'test prompt content';
      const mockAction = vi.fn().mockResolvedValue({
        type: 'submit_prompt',
        content: promptContent,
      });

      const mockCommand: Command = {
        name: 'test',
        description: 'Test command',
        action: mockAction,
      };

      const mockCommandService = {
        getCommands: vi.fn(() => [mockCommand]),
      };

      vi.mocked(CommandService.create).mockResolvedValue(
        mockCommandService as never,
      );

      vi.mocked(commandsModule.parseSlashCommand).mockReturnValue({
        commandToExecute: mockCommand,
        args: [],
      });

      const result = await handleSlashCommand(
        '/test',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(result).toBe(promptContent);
    });

    it('should throw FatalInputError for confirm_shell_commands result', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        type: 'confirm_shell_commands',
        commands: ['ls', 'pwd'],
      });

      const mockCommand: Command = {
        name: 'test',
        description: 'Test command',
        action: mockAction,
      };

      const mockCommandService = {
        getCommands: vi.fn(() => [mockCommand]),
      };

      vi.mocked(CommandService.create).mockResolvedValue(
        mockCommandService as never,
      );

      vi.mocked(commandsModule.parseSlashCommand).mockReturnValue({
        commandToExecute: mockCommand,
        args: [],
      });

      await expect(
        handleSlashCommand(
          '/test',
          mockAbortController,
          mockConfig,
          mockSettings,
        ),
      ).rejects.toThrow(FatalInputError);

      await expect(
        handleSlashCommand(
          '/test',
          mockAbortController,
          mockConfig,
          mockSettings,
        ),
      ).rejects.toThrow('confirmation prompt');
    });

    it('should throw FatalInputError for unsupported result types', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        type: 'some_other_type',
      });

      const mockCommand: Command = {
        name: 'test',
        description: 'Test command',
        action: mockAction,
      };

      const mockCommandService = {
        getCommands: vi.fn(() => [mockCommand]),
      };

      vi.mocked(CommandService.create).mockResolvedValue(
        mockCommandService as never,
      );

      vi.mocked(commandsModule.parseSlashCommand).mockReturnValue({
        commandToExecute: mockCommand,
        args: [],
      });

      await expect(
        handleSlashCommand(
          '/test',
          mockAbortController,
          mockConfig,
          mockSettings,
        ),
      ).rejects.toThrow(FatalInputError);

      await expect(
        handleSlashCommand(
          '/test',
          mockAbortController,
          mockConfig,
          mockSettings,
        ),
      ).rejects.toThrow('not supported in non-interactive mode');
    });

    it('should return undefined when command has no action', async () => {
      const mockCommand: Command = {
        name: 'test',
        description: 'Test command',
        // No action
      };

      const mockCommandService = {
        getCommands: vi.fn(() => [mockCommand]),
      };

      vi.mocked(CommandService.create).mockResolvedValue(
        mockCommandService as never,
      );

      vi.mocked(commandsModule.parseSlashCommand).mockReturnValue({
        commandToExecute: mockCommand,
        args: [],
      });

      const result = await handleSlashCommand(
        '/test',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(result).toBeUndefined();
    });

    it('should return undefined when command action returns undefined', async () => {
      const mockAction = vi.fn().mockResolvedValue(undefined);

      const mockCommand: Command = {
        name: 'test',
        description: 'Test command',
        action: mockAction,
      };

      const mockCommandService = {
        getCommands: vi.fn(() => [mockCommand]),
      };

      vi.mocked(CommandService.create).mockResolvedValue(
        mockCommandService as never,
      );

      vi.mocked(commandsModule.parseSlashCommand).mockReturnValue({
        commandToExecute: mockCommand,
        args: [],
      });

      const result = await handleSlashCommand(
        '/test',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(result).toBeUndefined();
    });

    it('should return undefined when no command found', async () => {
      const mockCommandService = {
        getCommands: vi.fn(() => []),
      };

      vi.mocked(CommandService.create).mockResolvedValue(
        mockCommandService as never,
      );

      vi.mocked(commandsModule.parseSlashCommand).mockReturnValue({
        commandToExecute: undefined,
        args: [],
      });

      const result = await handleSlashCommand(
        '/unknown',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(result).toBeUndefined();
    });

    it('should provide session stats to command context', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        type: 'submit_prompt',
        content: 'test',
      });

      const mockCommand: Command = {
        name: 'test',
        description: 'Test command',
        action: mockAction,
      };

      const mockCommandService = {
        getCommands: vi.fn(() => [mockCommand]),
      };

      vi.mocked(CommandService.create).mockResolvedValue(
        mockCommandService as never,
      );

      vi.mocked(commandsModule.parseSlashCommand).mockReturnValue({
        commandToExecute: mockCommand,
        args: [],
      });

      await handleSlashCommand(
        '/test',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(mockAction).toHaveBeenCalledWith(
        expect.objectContaining({
          session: expect.objectContaining({
            stats: expect.objectContaining({
              sessionId: 'test-session-123',
              promptCount: 1,
            }),
          }),
        }),
        [],
      );
    });

    it('should provide logger to command context', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        type: 'submit_prompt',
        content: 'test',
      });

      const mockCommand: Command = {
        name: 'test',
        description: 'Test command',
        action: mockAction,
      };

      const mockCommandService = {
        getCommands: vi.fn(() => [mockCommand]),
      };

      vi.mocked(CommandService.create).mockResolvedValue(
        mockCommandService as never,
      );

      vi.mocked(commandsModule.parseSlashCommand).mockReturnValue({
        commandToExecute: mockCommand,
        args: [],
      });

      await handleSlashCommand(
        '/test',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(mockAction).toHaveBeenCalledWith(
        expect.objectContaining({
          services: expect.objectContaining({
            logger: expect.any(Object),
          }),
        }),
        [],
      );
    });

    it('should provide invocation details to command context', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        type: 'submit_prompt',
        content: 'test',
      });

      const mockCommand: Command = {
        name: 'mycommand',
        description: 'Test command',
        action: mockAction,
      };

      const mockCommandService = {
        getCommands: vi.fn(() => [mockCommand]),
      };

      vi.mocked(CommandService.create).mockResolvedValue(
        mockCommandService as never,
      );

      vi.mocked(commandsModule.parseSlashCommand).mockReturnValue({
        commandToExecute: mockCommand,
        args: ['arg1', 'arg2'],
      });

      await handleSlashCommand(
        '/mycommand arg1 arg2',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(mockAction).toHaveBeenCalledWith(
        expect.objectContaining({
          invocation: {
            raw: '/mycommand arg1 arg2',
            name: 'mycommand',
            args: ['arg1', 'arg2'],
          },
        }),
        ['arg1', 'arg2'],
      );
    });

    it('should handle slash at start after trim', async () => {
      const mockCommandService = {
        getCommands: vi.fn(() => []),
      };

      vi.mocked(CommandService.create).mockResolvedValue(
        mockCommandService as never,
      );

      vi.mocked(commandsModule.parseSlashCommand).mockReturnValue({
        commandToExecute: undefined,
        args: [],
      });

      await handleSlashCommand(
        '  /command  ',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(commandsModule.parseSlashCommand).toHaveBeenCalledWith(
        '/command',
        [],
      );
    });

    it('should use abort controller signal', async () => {
      const mockCommandService = {
        getCommands: vi.fn(() => []),
      };

      vi.mocked(CommandService.create).mockResolvedValue(
        mockCommandService as never,
      );

      vi.mocked(commandsModule.parseSlashCommand).mockReturnValue({
        commandToExecute: undefined,
        args: [],
      });

      await handleSlashCommand(
        '/test',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(CommandService.create).toHaveBeenCalledWith(
        expect.any(Array),
        mockAbortController.signal,
      );
    });

    it('should handle missing session ID', async () => {
      mockConfig.getSessionId = vi.fn(() => '');

      const mockAction = vi.fn().mockResolvedValue({
        type: 'submit_prompt',
        content: 'test',
      });

      const mockCommand: Command = {
        name: 'test',
        description: 'Test command',
        action: mockAction,
      };

      const mockCommandService = {
        getCommands: vi.fn(() => [mockCommand]),
      };

      vi.mocked(CommandService.create).mockResolvedValue(
        mockCommandService as never,
      );

      vi.mocked(commandsModule.parseSlashCommand).mockReturnValue({
        commandToExecute: mockCommand,
        args: [],
      });

      await handleSlashCommand(
        '/test',
        mockAbortController,
        mockConfig,
        mockSettings,
      );

      expect(mockAction).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should propagate command execution errors', async () => {
      const testError = new Error('Command failed');
      const mockAction = vi.fn().mockRejectedValue(testError);

      const mockCommand: Command = {
        name: 'test',
        description: 'Test command',
        action: mockAction,
      };

      const mockCommandService = {
        getCommands: vi.fn(() => [mockCommand]),
      };

      vi.mocked(CommandService.create).mockResolvedValue(
        mockCommandService as never,
      );

      vi.mocked(commandsModule.parseSlashCommand).mockReturnValue({
        commandToExecute: mockCommand,
        args: [],
      });

      await expect(
        handleSlashCommand(
          '/test',
          mockAbortController,
          mockConfig,
          mockSettings,
        ),
      ).rejects.toThrow('Command failed');
    });

    it('should propagate CommandService creation errors', async () => {
      const testError = new Error('Service creation failed');
      vi.mocked(CommandService.create).mockRejectedValue(testError);

      await expect(
        handleSlashCommand(
          '/test',
          mockAbortController,
          mockConfig,
          mockSettings,
        ),
      ).rejects.toThrow('Service creation failed');
    });
  });
});
