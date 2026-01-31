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
import * as fs from 'node:fs';
import * as trustedFolders from '../../config/trustedFolders.js';
import type { LoadedTrustedFolders } from '../../config/trustedFolders.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    realpathSync: vi.fn((p) => p),
  };
});

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
      targetDir: path.resolve('/test/dir'),
      addDirectory: vi.fn(),
      addDirectories: vi.fn().mockReturnValue({ added: [], failed: [] }),
      getDirectories: vi
        .fn()
        .mockReturnValue([
          path.resolve('/home/user/project1'),
          path.resolve('/home/user/project2'),
        ]),
    } as unknown as WorkspaceContext;

    mockConfig = {
      getWorkspaceContext: () => mockWorkspaceContext,
      isRestrictiveSandbox: vi.fn().mockReturnValue(false),
      getGeminiClient: vi.fn().mockReturnValue({
        addDirectoryContext: vi.fn(),
        getChatRecordingService: vi.fn().mockReturnValue({
          recordDirectories: vi.fn(),
        }),
      }),
      getWorkingDir: () => path.resolve('/test/dir'),
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
          text: `Current workspace directories:\n- ${path.resolve(
            '/home/user/project1',
          )}\n- ${path.resolve('/home/user/project2')}`,
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
      const newPath = path.resolve('/home/user/new-project');
      vi.mocked(mockWorkspaceContext.addDirectories).mockReturnValue({
        added: [newPath],
        failed: [],
      });
      if (!addCommand?.action) throw new Error('No action');
      await addCommand.action(mockContext, newPath);
      expect(mockWorkspaceContext.addDirectories).toHaveBeenCalledWith([
        newPath,
      ]);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: `Successfully added directories:\n- ${newPath}`,
        }),
      );
    });

    it('should call addDirectory for each path and show a success message for multiple paths', async () => {
      const newPath1 = path.resolve('/home/user/new-project1');
      const newPath2 = path.resolve('/home/user/new-project2');
      vi.mocked(mockWorkspaceContext.addDirectories).mockReturnValue({
        added: [newPath1, newPath2],
        failed: [],
      });
      if (!addCommand?.action) throw new Error('No action');
      await addCommand.action(mockContext, `${newPath1},${newPath2}`);
      expect(mockWorkspaceContext.addDirectories).toHaveBeenCalledWith([
        newPath1,
        newPath2,
      ]);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: `Successfully added directories:\n- ${newPath1}\n- ${newPath2}`,
        }),
      );
    });

    it('should show an error if addDirectory throws an exception', async () => {
      const error = new Error('Directory does not exist');
      const newPath = path.resolve('/home/user/invalid-project');
      vi.mocked(mockWorkspaceContext.addDirectories).mockReturnValue({
        added: [],
        failed: [{ path: newPath, error }],
      });
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
      const newPath = path.resolve('/home/user/new-project');
      vi.mocked(mockWorkspaceContext.addDirectories).mockReturnValue({
        added: [newPath],
        failed: [],
      });

      await addCommand.action(mockContext, newPath);

      expect(mockWorkspaceContext.addDirectories).toHaveBeenCalledWith([
        newPath,
      ]);
    });

    it('should show an info message for an already added directory', async () => {
      const existingPath = path.resolve('/home/user/project1');
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

    it('should show an info message for an already added directory specified as a relative path', async () => {
      const existingPath = path.resolve('/home/user/project1');
      const relativePath = './project1';
      const absoluteRelativePath = path.resolve(
        path.resolve('/test/dir'),
        relativePath,
      );

      vi.mocked(fs.realpathSync).mockImplementation((p) => {
        if (p === absoluteRelativePath) return existingPath;
        return p as string;
      });

      if (!addCommand?.action) throw new Error('No action');
      await addCommand.action(mockContext, relativePath);

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: `The following directories are already in the workspace:\n- ${relativePath}`,
        }),
      );
    });

    it('should handle a mix of successful and failed additions', async () => {
      const validPath = path.resolve('/home/user/valid-project');
      const invalidPath = path.resolve('/home/user/invalid-project');
      const error = new Error('Directory does not exist');
      vi.mocked(mockWorkspaceContext.addDirectories).mockReturnValue({
        added: [validPath],
        failed: [{ path: invalidPath, error }],
      });

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

      it('should filter out existing directories from suggestions', async () => {
        const existingPath = path.resolve(process.cwd(), 'existing');
        vi.mocked(mockWorkspaceContext.getDirectories).mockReturnValue([
          existingPath,
        ]);
        vi.mocked(getDirectorySuggestions).mockResolvedValue([
          'existing/',
          'new/',
        ]);

        const results = await completion(mockContext, 'ex');

        expect(results).toEqual(['new/']);
      });
    });
  });

  describe('add with folder trust enabled', () => {
    let mockIsPathTrusted: Mock;

    beforeEach(() => {
      vi.spyOn(trustedFolders, 'isFolderTrustEnabled').mockReturnValue(true);
      // isWorkspaceTrusted is no longer checked, so we don't need to mock it returning true
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
      const newPath = path.resolve('/home/user/trusted-project');
      vi.mocked(mockWorkspaceContext.addDirectories).mockReturnValue({
        added: [newPath],
        failed: [],
      });

      await addCommand.action(mockContext, newPath);

      expect(mockWorkspaceContext.addDirectories).toHaveBeenCalledWith([
        newPath,
      ]);
    });

    it('should return a custom dialog for an explicitly untrusted directory (upgrade flow)', async () => {
      if (!addCommand?.action) throw new Error('No action');
      mockIsPathTrusted.mockReturnValue(false); // DO_NOT_TRUST
      const newPath = path.resolve('/home/user/untrusted-project');

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

    it('should return a custom dialog for a directory with undefined trust', async () => {
      if (!addCommand?.action) throw new Error('No action');
      mockIsPathTrusted.mockReturnValue(undefined);
      const newPath = path.resolve('/home/user/undefined-trust-project');

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

    it('should prompt for directory even if workspace is untrusted', async () => {
      if (!addCommand?.action) throw new Error('No action');
      // Even if workspace is untrusted, we should still check directory trust
      vi.spyOn(trustedFolders, 'isWorkspaceTrusted').mockReturnValue({
        isTrusted: false,
        source: 'file',
      });
      mockIsPathTrusted.mockReturnValue(undefined);
      const newPath = path.resolve('/home/user/new-project');

      const result = await addCommand.action(mockContext, newPath);

      expect(result).toEqual(
        expect.objectContaining({
          type: 'custom_dialog',
        }),
      );
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
