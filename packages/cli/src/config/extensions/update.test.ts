/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  EXTENSIONS_CONFIG_FILENAME,
  ExtensionStorage,
  INSTALL_METADATA_FILENAME,
  annotateActiveExtensions,
  loadExtension,
} from '../extension.js';
import { checkForAllExtensionUpdates, updateExtension } from './update.js';
import { GEMINI_DIR } from '@google/gemini-cli-core';
import { isWorkspaceTrusted } from '../trustedFolders.js';
import { ExtensionUpdateState } from '../../ui/state/extensions.js';
import { createExtension } from '../../test-utils/createExtension.js';
import { ExtensionEnablementManager } from './extensionEnablement.js';

const mockGit = {
  clone: vi.fn(),
  getRemotes: vi.fn(),
  fetch: vi.fn(),
  checkout: vi.fn(),
  listRemote: vi.fn(),
  revparse: vi.fn(),
  // Not a part of the actual API, but we need to use this to do the correct
  // file system interactions.
  path: vi.fn(),
};

vi.mock('simple-git', () => ({
  simpleGit: vi.fn((path: string) => {
    mockGit.path.mockReturnValue(path);
    return mockGit;
  }),
}));

vi.mock('os', async (importOriginal) => {
  const mockedOs = await importOriginal<typeof os>();
  return {
    ...mockedOs,
    homedir: vi.fn(),
  };
});

vi.mock('../trustedFolders.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../trustedFolders.js')>();
  return {
    ...actual,
    isWorkspaceTrusted: vi.fn(),
  };
});

const mockLogExtensionInstallEvent = vi.hoisted(() => vi.fn());
const mockLogExtensionUninstall = vi.hoisted(() => vi.fn());

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    logExtensionInstallEvent: mockLogExtensionInstallEvent,
    logExtensionUninstall: mockLogExtensionUninstall,
    ExtensionInstallEvent: vi.fn(),
    ExtensionUninstallEvent: vi.fn(),
  };
});

describe('update tests', () => {
  let tempHomeDir: string;
  let tempWorkspaceDir: string;
  let userExtensionsDir: string;

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(tempHomeDir, 'gemini-cli-test-workspace-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    userExtensionsDir = path.join(tempHomeDir, GEMINI_DIR, 'extensions');
    // Clean up before each test
    fs.rmSync(userExtensionsDir, { recursive: true, force: true });
    fs.mkdirSync(userExtensionsDir, { recursive: true });
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: 'file',
    });
    vi.spyOn(process, 'cwd').mockReturnValue(tempWorkspaceDir);
    Object.values(mockGit).forEach((fn) => fn.mockReset());
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
  });

  describe('updateExtension', () => {
    it('should update a git-installed extension', async () => {
      const gitUrl = 'https://github.com/google/gemini-extensions.git';
      const extensionName = 'gemini-extensions';
      const targetExtDir = path.join(userExtensionsDir, extensionName);
      const metadataPath = path.join(targetExtDir, INSTALL_METADATA_FILENAME);

      fs.mkdirSync(targetExtDir, { recursive: true });
      fs.writeFileSync(
        path.join(targetExtDir, EXTENSIONS_CONFIG_FILENAME),
        JSON.stringify({ name: extensionName, version: '1.0.0' }),
      );
      fs.writeFileSync(
        metadataPath,
        JSON.stringify({ source: gitUrl, type: 'git' }),
      );

      mockGit.clone.mockImplementation(async (_, destination) => {
        fs.mkdirSync(path.join(mockGit.path(), destination), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(mockGit.path(), destination, EXTENSIONS_CONFIG_FILENAME),
          JSON.stringify({ name: extensionName, version: '1.1.0' }),
        );
      });
      mockGit.getRemotes.mockResolvedValue([{ name: 'origin' }]);
      const extension = annotateActiveExtensions(
        [
          loadExtension({
            extensionDir: targetExtDir,
            workspaceDir: tempWorkspaceDir,
          })!,
        ],
        process.cwd(),
        new ExtensionEnablementManager(ExtensionStorage.getUserExtensionsDir()),
      )[0];
      const updateInfo = await updateExtension(
        extension,
        tempHomeDir,
        async (_) => true,
        ExtensionUpdateState.UPDATE_AVAILABLE,
        () => {},
      );

      expect(updateInfo).toEqual({
        name: 'gemini-extensions',
        originalVersion: '1.0.0',
        updatedVersion: '1.1.0',
      });

      const updatedConfig = JSON.parse(
        fs.readFileSync(
          path.join(targetExtDir, EXTENSIONS_CONFIG_FILENAME),
          'utf-8',
        ),
      );
      expect(updatedConfig.version).toBe('1.1.0');
    });

    it('should call setExtensionUpdateState with UPDATING and then UPDATED_NEEDS_RESTART on success', async () => {
      const extensionName = 'test-extension';
      const extensionDir = createExtension({
        extensionsDir: userExtensionsDir,
        name: extensionName,
        version: '1.0.0',
        installMetadata: {
          source: 'https://some.git/repo',
          type: 'git',
        },
      });

      mockGit.clone.mockImplementation(async (_, destination) => {
        fs.mkdirSync(path.join(mockGit.path(), destination), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(mockGit.path(), destination, EXTENSIONS_CONFIG_FILENAME),
          JSON.stringify({ name: extensionName, version: '1.1.0' }),
        );
      });
      mockGit.getRemotes.mockResolvedValue([{ name: 'origin' }]);

      const dispatch = vi.fn();
      const extension = annotateActiveExtensions(
        [
          loadExtension({
            extensionDir,
            workspaceDir: tempWorkspaceDir,
          })!,
        ],
        process.cwd(),
        new ExtensionEnablementManager(ExtensionStorage.getUserExtensionsDir()),
      )[0];
      await updateExtension(
        extension,
        tempHomeDir,
        async (_) => true,
        ExtensionUpdateState.UPDATE_AVAILABLE,
        dispatch,
      );

      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: extensionName,
          state: ExtensionUpdateState.UPDATING,
        },
      });
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: extensionName,
          state: ExtensionUpdateState.UPDATED_NEEDS_RESTART,
        },
      });
    });

    it('should call setExtensionUpdateState with ERROR on failure', async () => {
      const extensionName = 'test-extension';
      const extensionDir = createExtension({
        extensionsDir: userExtensionsDir,
        name: extensionName,
        version: '1.0.0',
        installMetadata: {
          source: 'https://some.git/repo',
          type: 'git',
        },
      });

      mockGit.clone.mockRejectedValue(new Error('Git clone failed'));
      mockGit.getRemotes.mockResolvedValue([{ name: 'origin' }]);

      const dispatch = vi.fn();
      const extension = annotateActiveExtensions(
        [
          loadExtension({
            extensionDir,
            workspaceDir: tempWorkspaceDir,
          })!,
        ],
        process.cwd(),
        new ExtensionEnablementManager(ExtensionStorage.getUserExtensionsDir()),
      )[0];
      await expect(
        updateExtension(
          extension,
          tempHomeDir,
          async (_) => true,
          ExtensionUpdateState.UPDATE_AVAILABLE,
          dispatch,
        ),
      ).rejects.toThrow();

      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: extensionName,
          state: ExtensionUpdateState.UPDATING,
        },
      });
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: extensionName,
          state: ExtensionUpdateState.ERROR,
        },
      });
    });
  });

  describe('checkForAllExtensionUpdates', () => {
    it('should return UpdateAvailable for a git extension with updates', async () => {
      const extensionDir = createExtension({
        extensionsDir: userExtensionsDir,
        name: 'test-extension',
        version: '1.0.0',
        installMetadata: {
          source: 'https://some.git/repo',
          type: 'git',
        },
      });
      const extension = annotateActiveExtensions(
        [
          loadExtension({
            extensionDir,
            workspaceDir: tempWorkspaceDir,
          })!,
        ],
        process.cwd(),
        new ExtensionEnablementManager(ExtensionStorage.getUserExtensionsDir()),
      )[0];

      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'https://some.git/repo' } },
      ]);
      mockGit.listRemote.mockResolvedValue('remoteHash	HEAD');
      mockGit.revparse.mockResolvedValue('localHash');

      const dispatch = vi.fn();
      await checkForAllExtensionUpdates([extension], dispatch);
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: 'test-extension',
          state: ExtensionUpdateState.UPDATE_AVAILABLE,
        },
      });
    });

    it('should return UpToDate for a git extension with no updates', async () => {
      const extensionDir = createExtension({
        extensionsDir: userExtensionsDir,
        name: 'test-extension',
        version: '1.0.0',
        installMetadata: {
          source: 'https://some.git/repo',
          type: 'git',
        },
      });
      const extension = annotateActiveExtensions(
        [
          loadExtension({
            extensionDir,
            workspaceDir: tempWorkspaceDir,
          })!,
        ],
        process.cwd(),
        new ExtensionEnablementManager(ExtensionStorage.getUserExtensionsDir()),
      )[0];

      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'https://some.git/repo' } },
      ]);
      mockGit.listRemote.mockResolvedValue('sameHash	HEAD');
      mockGit.revparse.mockResolvedValue('sameHash');

      const dispatch = vi.fn();
      await checkForAllExtensionUpdates([extension], dispatch);
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: 'test-extension',
          state: ExtensionUpdateState.UP_TO_DATE,
        },
      });
    });

    it('should return UpToDate for a local extension with no updates', async () => {
      const localExtensionSourcePath = path.join(tempHomeDir, 'local-source');
      const sourceExtensionDir = createExtension({
        extensionsDir: localExtensionSourcePath,
        name: 'my-local-ext',
        version: '1.0.0',
      });

      const installedExtensionDir = createExtension({
        extensionsDir: userExtensionsDir,
        name: 'local-extension',
        version: '1.0.0',
        installMetadata: { source: sourceExtensionDir, type: 'local' },
      });
      const extension = annotateActiveExtensions(
        [
          loadExtension({
            extensionDir: installedExtensionDir,
            workspaceDir: tempWorkspaceDir,
          })!,
        ],
        process.cwd(),
        new ExtensionEnablementManager(ExtensionStorage.getUserExtensionsDir()),
      )[0];
      const dispatch = vi.fn();
      await checkForAllExtensionUpdates([extension], dispatch);
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: 'local-extension',
          state: ExtensionUpdateState.UP_TO_DATE,
        },
      });
    });

    it('should return UpdateAvailable for a local extension with updates', async () => {
      const localExtensionSourcePath = path.join(tempHomeDir, 'local-source');
      const sourceExtensionDir = createExtension({
        extensionsDir: localExtensionSourcePath,
        name: 'my-local-ext',
        version: '1.1.0',
      });

      const installedExtensionDir = createExtension({
        extensionsDir: userExtensionsDir,
        name: 'local-extension',
        version: '1.0.0',
        installMetadata: { source: sourceExtensionDir, type: 'local' },
      });
      const extension = annotateActiveExtensions(
        [
          loadExtension({
            extensionDir: installedExtensionDir,
            workspaceDir: tempWorkspaceDir,
          })!,
        ],
        process.cwd(),
        new ExtensionEnablementManager(ExtensionStorage.getUserExtensionsDir()),
      )[0];
      const dispatch = vi.fn();
      await checkForAllExtensionUpdates([extension], dispatch);
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: 'local-extension',
          state: ExtensionUpdateState.UPDATE_AVAILABLE,
        },
      });
    });

    it('should return Error when git check fails', async () => {
      const extensionDir = createExtension({
        extensionsDir: userExtensionsDir,
        name: 'error-extension',
        version: '1.0.0',
        installMetadata: {
          source: 'https://some.git/repo',
          type: 'git',
        },
      });
      const extension = annotateActiveExtensions(
        [
          loadExtension({
            extensionDir,
            workspaceDir: tempWorkspaceDir,
          })!,
        ],
        process.cwd(),
        new ExtensionEnablementManager(ExtensionStorage.getUserExtensionsDir()),
      )[0];

      mockGit.getRemotes.mockRejectedValue(new Error('Git error'));

      const dispatch = vi.fn();
      await checkForAllExtensionUpdates([extension], dispatch);
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: 'error-extension',
          state: ExtensionUpdateState.ERROR,
        },
      });
    });
  });
});
