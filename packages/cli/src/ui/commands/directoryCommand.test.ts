/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { directoryCommand, expandHomeDir } from './directoryCommand.js';
import { type CommandContext } from './types.js';
import { WorkspaceContext } from '@google/gemini-cli-core';
import * as path from 'path';
import * as os from 'os';

describe('directoryCommand', () => {
  let mockContext: CommandContext;
  let mockWorkspaceContext: WorkspaceContext;

  beforeEach(() => {
    vi.resetAllMocks();

    mockWorkspaceContext = {
      addDirectory: vi.fn(),
      getDirectories: vi.fn().mockReturnValue(['/home/user/project']),
      isPathWithinWorkspace: vi.fn(),
    } as unknown as WorkspaceContext;

    mockContext = {
      services: {
        config: {
          getWorkspaceContext: vi.fn().mockReturnValue(mockWorkspaceContext),
          isRestrictiveSandbox: vi.fn().mockReturnValue(false),
          getGeminiClient: vi.fn().mockReturnValue({
            refreshEnvironment: vi.fn(),
          }),
        },
      },
    } as unknown as CommandContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('main command', () => {
    it('should show help when no subcommand is provided', () => {
      if (!directoryCommand.action) {
        throw new Error('Directory command has no action');
      }
      const result = directoryCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: `Invalid subcommand. Available commands:
  /directory add <path>  - Add a directory to the workspace
  /directory show        - Show all workspace directories`,
      });
    });

    it('should have an alternative name', () => {
      expect(directoryCommand.altNames).toEqual(['dir']);
    });
  });

  describe('add subcommand', () => {
    const addCommand = directoryCommand.subCommands?.find(
      (cmd) => cmd.name === 'add',
    );

    it('should add a directory successfully', () => {
      if (!addCommand?.action) {
        throw new Error('Add subcommand has no action');
      }
      const result = addCommand.action(mockContext, '/path/to/new/dir');

      expect(mockWorkspaceContext.addDirectory).toHaveBeenCalledWith(
        '/path/to/new/dir',
      );
      expect(result).toEqual({
        type: 'update_context',
        message: 'Added directory to workspace: /path/to/new/dir',
      });
    });

    it('should handle no config available', () => {
      const contextWithoutConfig = {
        services: {
          config: null,
        },
      } as unknown as CommandContext;

      if (!addCommand?.action) {
        throw new Error('Add subcommand has no action');
      }
      const result = addCommand.action(contextWithoutConfig, '/path/to/dir');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No configuration available',
      });
    });

    it('should handle empty directory path', () => {
      if (!addCommand?.action) {
        throw new Error('Add subcommand has no action');
      }
      const result = addCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Please provide a directory path: /directory add <path>',
      });
    });

    it('should handle errors when adding directory', () => {
      vi.mocked(mockWorkspaceContext.addDirectory).mockImplementation(() => {
        throw new Error('Directory does not exist');
      });

      if (!addCommand?.action) {
        throw new Error('Add subcommand has no action');
      }
      const result = addCommand.action(mockContext, '/invalid/path');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Failed to add directory: Directory does not exist',
      });
    });

    describe('sandbox profile restrictions', () => {
      it('should block add command in restrictive sandbox profile', () => {
        vi.mocked(
          mockContext.services.config.isRestrictiveSandbox,
        ).mockReturnValue(true);

        if (!addCommand?.action) {
          throw new Error('Add subcommand has no action');
        }
        const result = addCommand.action(mockContext, '/path/to/dir');

        expect(mockWorkspaceContext.addDirectory).not.toHaveBeenCalled();
        expect(result).toEqual({
          type: 'message',
          messageType: 'error',
          content:
            'The /directory add command is not supported in restrictive sandbox profiles. Please use --include-directories when starting the session instead.',
        });
      });

      it('should allow add command when not in a restrictive sandbox', () => {
        vi.mocked(
          mockContext.services.config.isRestrictiveSandbox,
        ).mockReturnValue(false);

        if (!addCommand?.action) {
          throw new Error('Add subcommand has no action');
        }
        const result = addCommand.action(mockContext, '/path/to/dir');

        expect(mockWorkspaceContext.addDirectory).toHaveBeenCalledWith(
          '/path/to/dir',
        );
        expect(result).toEqual({
          type: 'update_context',
          message: 'Added directory to workspace: /path/to/dir',
        });
      });
    });
  });

  describe('show subcommand', () => {
    const showCommand = directoryCommand.subCommands?.find(
      (cmd) => cmd.name === 'show',
    );

    it('should show all workspace directories', () => {
      vi.mocked(mockWorkspaceContext.getDirectories).mockReturnValue([
        '/home/user/project',
        '/home/user/library',
        '/home/user/shared',
      ]);

      if (!showCommand?.action) {
        throw new Error('Show subcommand has no action');
      }
      const result = showCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: `Workspace directories:
  1. /home/user/project
  2. /home/user/library
  3. /home/user/shared`,
      });
    });

    it('should handle no config available', () => {
      const contextWithoutConfig = {
        services: {
          config: null,
        },
      } as unknown as CommandContext;

      if (!showCommand?.action) {
        throw new Error('Show subcommand has no action');
      }
      const result = showCommand.action(contextWithoutConfig, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No configuration available',
      });
    });

    it('should handle empty workspace', () => {
      vi.mocked(mockWorkspaceContext.getDirectories).mockReturnValue([]);

      if (!showCommand?.action) {
        throw new Error('Show subcommand has no action');
      }
      const result = showCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No directories in workspace',
      });
    });

    it('should handle errors when getting directories', () => {
      vi.mocked(mockWorkspaceContext.getDirectories).mockImplementation(() => {
        throw new Error('Failed to retrieve directories');
      });

      if (!showCommand?.action) {
        throw new Error('Show subcommand has no action');
      }
      const result = showCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Failed to list directories: Failed to retrieve directories',
      });
    });

    it('should correctly expand a Windows-style home directory path', () => {
      const windowsPath = '%userprofile%\\Documents';
      const expectedPath = path.win32.join(os.homedir(), 'Documents');
      const result = expandHomeDir(windowsPath);
      expect(path.win32.normalize(result)).toBe(
        path.win32.normalize(expectedPath),
      );
    });
  });
});
