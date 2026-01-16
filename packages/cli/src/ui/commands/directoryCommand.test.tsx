/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { directoryCommand } from './directoryCommand.js';
import {
  expandHomeDir,
  getDirectorySuggestions,
} from '../utils/directoryUtils.js';
import type { Config, WorkspaceContext } from '@google/gemini-cli-core';
import type { MultiFolderTrustDialogProps } from '../components/MultiFolderTrustDialog.js';
import type { CommandContext, OpenCustomDialogActionReturn } from './types.js';
import { MessageType } from '../types.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as trustedFolders from '../../config/trustedFolders.js';
import type { LoadedTrustedFolders } from '../../config/trustedFolders.js';

vi.mock('../utils/directoryUtils.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/directoryUtils.js')>();
  return {
    ...actual,
    getDirectorySuggestions: vi.fn(),
  };
});

describe('directoryCommand', () => {
  let mockContext: CommandContext;
  let mockConfig: Config;
  let mockWorkspaceContext: WorkspaceContext;
  const addCommand = directoryCommand.subCommands?.find(
    (c) => c.name === 'add',
  );
  const showCommand = directoryCommand.subCommands?.find(
    (c) => c.name === 'show',
  );

  beforeEach(() => {
    mockWorkspaceContext = {
      addDirectory: vi.fn(),
      getDirectories: vi
        .fn()
        .mockReturnValue([
          path.normalize('/home/user/project1'),
          path.normalize('/home/user/project2'),
        ]),
    } as unknown as WorkspaceContext;

    mockConfig = {
      getWorkspaceContext: () => mockWorkspaceContext,
      isRestrictiveSandbox: vi.fn().mockReturnValue(false),
      getGeminiClient: vi.fn().mockReturnValue({
        addDirectoryContext: vi.fn(),
      }),
      getWorkingDir: () => '/test/dir',
      shouldLoadMemoryFromIncludeDirectories: () => false,
      getDebugMode: () => false,
      getFileService: () => ({}),
      getFileFilteringOptions: () => ({ ignore: [], include: [] }),
      setUserMemory: vi.fn(),
      setGeminiMdFileCount: vi.fn(),
    } as unknown as Config;

    mockContext = {
      services: {
        config: mockConfig,
        settings: {
          merged: {
            memoryDiscoveryMaxDirs: 1000,
          },
        },
      },
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext;
  });

  describe('show', () => {
    it('should display the list of directories', () => {
      if (!showCommand?.action) throw new Error('No action');
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      showCommand.action(mockContext, '');
      expect(mockWorkspaceContext.getDirectories).toHaveBeenCalled();
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: `Current workspace directories:\n- ${path.normalize(
            '/home/user/project1',
          )}\n- ${path.normalize('/home/user/project2')}`,
        }),
      );
    });
  });

  describe('add', () => {
    it('should show an error in a restrictive sandbox', async () => {
      if (!addCommand?.action) throw new Error('No action');
      vi.mocked(mockConfig.isRestrictiveSandbox).mockReturnValue(true);
      const result = await addCommand.action(mockContext, '/some/path');
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content:
          'The /directory add command is not supported in restrictive sandbox profiles. Please use --include-directories when starting the session instead.',
      });
    });

    it('should show an error if no path is provided', () => {
      if (!addCommand?.action) throw new Error('No action');
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      addCommand.action(mockContext, '');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Please provide at least one path to add.',
        }),
      );
    });

    it('should call addDirectory and show a success message for a single path', async () => {
      const newPath = path.normalize('/home/user/new-project');
      if (!addCommand?.action) throw new Error('No action');
      await addCommand.action(mockContext, newPath);
      expect(mockWorkspaceContext.addDirectory).toHaveBeenCalledWith(newPath);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: `Successfully added directories:\n- ${newPath}`,
        }),
      );
    });

    it('should call addDirectory for each path and show a success message for multiple paths', async () => {
      const newPath1 = path.normalize('/home/user/new-project1');
      const newPath2 = path.normalize('/home/user/new-project2');
      if (!addCommand?.action) throw new Error('No action');
      await addCommand.action(mockContext, `${newPath1},${newPath2}`);
      expect(mockWorkspaceContext.addDirectory).toHaveBeenCalledWith(newPath1);
      expect(mockWorkspaceContext.addDirectory).toHaveBeenCalledWith(newPath2);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: `Successfully added directories:\n- ${newPath1}\n- ${newPath2}`,
        }),
      );
    });

    it('should show an error if addDirectory throws an exception', async () => {
      const error = new Error('Directory does not exist');
      vi.mocked(mockWorkspaceContext.addDirectory).mockImplementation(() => {
        throw error;
      });
      const newPath = path.normalize('/home/user/invalid-project');
      if (!addCommand?.action) throw new Error('No action');
      await addCommand.action(mockContext, newPath);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: `Error adding '${newPath}': ${error.message}`,
        }),
      );
    });

    it('should add directory directly when folder trust is disabled', async () => {
      if (!addCommand?.action) throw new Error('No action');
      vi.spyOn(trustedFolders, 'isFolderTrustEnabled').mockReturnValue(false);
      const newPath = path.normalize('/home/user/new-project');

      await addCommand.action(mockContext, newPath);

      expect(mockWorkspaceContext.addDirectory).toHaveBeenCalledWith(newPath);
    });

    it('should show an info message for an already added directory', async () => {
      const existingPath = path.normalize('/home/user/project1');
      if (!addCommand?.action) throw new Error('No action');
      await addCommand.action(mockContext, existingPath);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: `The following directories are already in the workspace:\n- ${existingPath}`,
        }),
      );
      expect(mockWorkspaceContext.addDirectory).not.toHaveBeenCalledWith(
        existingPath,
      );
    });

    it('should handle a mix of successful and failed additions', async () => {
      const validPath = path.normalize('/home/user/valid-project');
      const invalidPath = path.normalize('/home/user/invalid-project');
      const error = new Error('Directory does not exist');
      vi.mocked(mockWorkspaceContext.addDirectory).mockImplementation(
        (p: string) => {
          if (p === invalidPath) {
            throw error;
          }
        },
      );

      if (!addCommand?.action) throw new Error('No action');
      await addCommand.action(mockContext, `${validPath},${invalidPath}`);

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: `Successfully added directories:\n- ${validPath}`,
        }),
      );

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: `Error adding '${invalidPath}': ${error.message}`,
        }),
      );
    });

    describe('completion', () => {
      const completion = addCommand!.completion!;

      it('should return empty suggestions for an empty path', async () => {
        const results = await completion(mockContext, '');
        expect(results).toEqual([]);
      });

      it('should return empty suggestions for whitespace only path', async () => {
        const results = await completion(mockContext, '  ');
        expect(results).toEqual([]);
      });

      it('should return suggestions for a single path', async () => {
        vi.mocked(getDirectorySuggestions).mockResolvedValue(['docs/', 'src/']);

        const results = await completion(mockContext, 'd');

        expect(getDirectorySuggestions).toHaveBeenCalledWith('d');
        expect(results).toEqual(['docs/', 'src/']);
      });

      it('should return suggestions for multiple paths', async () => {
        vi.mocked(getDirectorySuggestions).mockResolvedValue(['src/']);

        const results = await completion(mockContext, 'docs/,s');

        expect(getDirectorySuggestions).toHaveBeenCalledWith('s');
        expect(results).toEqual(['docs/,src/']);
      });

      it('should handle leading whitespace in suggestions', async () => {
        vi.mocked(getDirectorySuggestions).mockResolvedValue(['src/']);

        const results = await completion(mockContext, 'docs/, s');

        expect(getDirectorySuggestions).toHaveBeenCalledWith('s');
        expect(results).toEqual(['docs/, src/']);
      });
    });
  });

  describe('add with folder trust enabled', () => {
    let mockIsPathTrusted: Mock;

    beforeEach(() => {
      vi.spyOn(trustedFolders, 'isFolderTrustEnabled').mockReturnValue(true);
      vi.spyOn(trustedFolders, 'isWorkspaceTrusted').mockReturnValue({
        isTrusted: true,
        source: 'file',
      });
      mockIsPathTrusted = vi.fn();
      const mockLoadedFolders = {
        isPathTrusted: mockIsPathTrusted,
      } as unknown as LoadedTrustedFolders;
      vi.spyOn(trustedFolders, 'loadTrustedFolders').mockReturnValue(
        mockLoadedFolders,
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should add a trusted directory', async () => {
      if (!addCommand?.action) throw new Error('No action');
      mockIsPathTrusted.mockReturnValue(true);
      const newPath = path.normalize('/home/user/trusted-project');

      await addCommand.action(mockContext, newPath);

      expect(mockWorkspaceContext.addDirectory).toHaveBeenCalledWith(newPath);
    });

    it('should show an error for an untrusted directory', async () => {
      if (!addCommand?.action) throw new Error('No action');
      mockIsPathTrusted.mockReturnValue(false);
      const newPath = path.normalize('/home/user/untrusted-project');

      await addCommand.action(mockContext, newPath);

      expect(mockWorkspaceContext.addDirectory).not.toHaveBeenCalled();
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: expect.stringContaining('explicitly untrusted'),
        }),
      );
    });

    it('should return a custom dialog for a directory with undefined trust', async () => {
      if (!addCommand?.action) throw new Error('No action');
      mockIsPathTrusted.mockReturnValue(undefined);
      const newPath = path.normalize('/home/user/undefined-trust-project');

      const result = await addCommand.action(mockContext, newPath);

      expect(result).toEqual(
        expect.objectContaining({
          type: 'custom_dialog',
          component: expect.objectContaining({
            type: expect.any(Function), // React component for MultiFolderTrustDialog
          }),
        }),
      );
      if (!result) {
        throw new Error('Command did not return a result');
      }
      const component = (result as OpenCustomDialogActionReturn)
        .component as React.ReactElement<MultiFolderTrustDialogProps>;
      expect(component.props.folders.includes(newPath)).toBeTruthy();
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
