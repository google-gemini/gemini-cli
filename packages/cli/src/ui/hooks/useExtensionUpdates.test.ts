/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createExtension } from '../../test-utils/createExtension.js';
import { useExtensionUpdates } from './useExtensionUpdates.js';
import { GEMINI_DIR, type GeminiCLIExtension } from '@google/gemini-cli-core';
import { renderHook, waitFor } from '@testing-library/react';
import { MessageType } from '../types.js';
import {
  checkForAllExtensionUpdates,
  updateExtension,
} from '../../config/extensions/update.js';
import { ExtensionUpdateState } from '../state/extensions.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import { loadSettings } from '../../config/settings.js';

vi.mock('os', async (importOriginal) => {
  const mockedOs = await importOriginal<typeof os>();
  return {
    ...mockedOs,
    homedir: vi.fn(),
  };
});

vi.mock('../../config/extensions/update.js', () => ({
  checkForAllExtensionUpdates: vi.fn(),
  updateExtension: vi.fn(),
}));

describe('useExtensionUpdates', () => {
  let tempHomeDir: string;
  let tempWorkspaceDir: string;
  let userExtensionsDir: string;
  let extensionManager: ExtensionManager;

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(tempHomeDir, 'gemini-cli-test-workspace-'),
    );
    vi.spyOn(process, 'cwd').mockReturnValue(tempWorkspaceDir);
    userExtensionsDir = path.join(tempHomeDir, GEMINI_DIR, 'extensions');
    fs.mkdirSync(userExtensionsDir, { recursive: true });
    vi.mocked(checkForAllExtensionUpdates).mockReset();
    vi.mocked(updateExtension).mockReset();
    extensionManager = new ExtensionManager({
      workspaceDir: tempHomeDir,
      requestConsent: vi.fn(),
      requestSetting: vi.fn(),
      loadedSettings: loadSettings(),
    });
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  });

  it('should check for updates and log a message if an update is available', async () => {
    const extensions = [
      {
        name: 'test-extension',
        id: 'test-extension-id',
        type: 'git',
        version: '1.0.0',
        path: '/some/path',
        isActive: true,
        installMetadata: {
          type: 'git',
          source: 'https://some/repo',
          autoUpdate: false,
        },
        contextFiles: [],
      },
    ];
    const addItem = vi.fn();

    vi.mocked(checkForAllExtensionUpdates).mockImplementation(
      async (_extensions, _extensionManager, dispatch) => {
        dispatch({
          type: 'SET_STATE',
          payload: {
            name: 'test-extension',
            state: ExtensionUpdateState.UPDATE_AVAILABLE,
          },
        });
      },
    );

    renderHook(() =>
      useExtensionUpdates(
        extensions as GeminiCLIExtension[],
        extensionManager,
        addItem,
      ),
    );

    await waitFor(() => {
      expect(addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: 'You have 1 extension with an update available, run "/extensions list" for more information.',
        },
        expect.any(Number),
      );
    });
  });

  it('should check for updates and automatically update if autoUpdate is true', async () => {
    const extensionDir = createExtension({
      extensionsDir: userExtensionsDir,
      name: 'test-extension',
      version: '1.0.0',
      installMetadata: {
        source: 'https://some.git/repo',
        type: 'git',
        autoUpdate: true,
      },
    });
    const extension = extensionManager.loadExtension(extensionDir)!;

    const addItem = vi.fn();

    vi.mocked(checkForAllExtensionUpdates).mockImplementation(
      async (_extensions, _extensionManager, dispatch) => {
        dispatch({
          type: 'SET_STATE',
          payload: {
            name: 'test-extension',
            state: ExtensionUpdateState.UPDATE_AVAILABLE,
          },
        });
      },
    );

    vi.mocked(updateExtension).mockResolvedValue({
      originalVersion: '1.0.0',
      updatedVersion: '1.1.0',
      name: '',
    });

    renderHook(() =>
      useExtensionUpdates([extension], extensionManager, addItem),
    );

    await waitFor(
      () => {
        expect(addItem).toHaveBeenCalledWith(
          {
            type: MessageType.INFO,
            text: 'Extension "test-extension" successfully updated: 1.0.0 → 1.1.0.',
          },
          expect.any(Number),
        );
      },
      { timeout: 4000 },
    );
  });

  it('should batch update notifications for multiple extensions', async () => {
    const extensionDir1 = createExtension({
      extensionsDir: userExtensionsDir,
      name: 'test-extension-1',
      version: '1.0.0',
      installMetadata: {
        source: 'https://some.git/repo1',
        type: 'git',
        autoUpdate: true,
      },
    });
    const extensionDir2 = createExtension({
      extensionsDir: userExtensionsDir,
      name: 'test-extension-2',
      version: '2.0.0',
      installMetadata: {
        source: 'https://some.git/repo2',
        type: 'git',
        autoUpdate: true,
      },
    });

    const extensions = [
      extensionManager.loadExtension(extensionDir1)!,
      extensionManager.loadExtension(extensionDir2)!,
    ];

    const addItem = vi.fn();

    vi.mocked(checkForAllExtensionUpdates).mockImplementation(
      async (_extensions, _extensionManager, dispatch) => {
        dispatch({
          type: 'SET_STATE',
          payload: {
            name: 'test-extension-1',
            state: ExtensionUpdateState.UPDATE_AVAILABLE,
          },
        });
        dispatch({
          type: 'SET_STATE',
          payload: {
            name: 'test-extension-2',
            state: ExtensionUpdateState.UPDATE_AVAILABLE,
          },
        });
      },
    );

    vi.mocked(updateExtension)
      .mockResolvedValueOnce({
        originalVersion: '1.0.0',
        updatedVersion: '1.1.0',
        name: '',
      })
      .mockResolvedValueOnce({
        originalVersion: '2.0.0',
        updatedVersion: '2.1.0',
        name: '',
      });

    renderHook(() =>
      useExtensionUpdates(extensions, extensionManager, addItem),
    );

    await waitFor(
      () => {
        expect(addItem).toHaveBeenCalledTimes(2);
        expect(addItem).toHaveBeenCalledWith(
          {
            type: MessageType.INFO,
            text: 'Extension "test-extension-1" successfully updated: 1.0.0 → 1.1.0.',
          },
          expect.any(Number),
        );
        expect(addItem).toHaveBeenCalledWith(
          {
            type: MessageType.INFO,
            text: 'Extension "test-extension-2" successfully updated: 2.0.0 → 2.1.0.',
          },
          expect.any(Number),
        );
      },
      { timeout: 4000 },
    );
  });

  it('should batch update notifications for multiple extensions with autoUpdate: false', async () => {
    const extensions = [
      {
        name: 'test-extension-1',
        id: 'test-extension-1-id',
        type: 'git',
        version: '1.0.0',
        path: '/some/path1',
        isActive: true,
        installMetadata: {
          type: 'git',
          source: 'https://some/repo1',
          autoUpdate: false,
        },
        contextFiles: [],
      },
      {
        name: 'test-extension-2',
        id: 'test-extension-2-id',

        type: 'git',
        version: '2.0.0',
        path: '/some/path2',
        isActive: true,
        installMetadata: {
          type: 'git',
          source: 'https://some/repo2',
          autoUpdate: false,
        },
        contextFiles: [],
      },
    ];
    const addItem = vi.fn();

    vi.mocked(checkForAllExtensionUpdates).mockImplementation(
      async (_extensions, _extensionManager, dispatch) => {
        dispatch({ type: 'BATCH_CHECK_START' });
        dispatch({
          type: 'SET_STATE',
          payload: {
            name: 'test-extension-1',
            state: ExtensionUpdateState.UPDATE_AVAILABLE,
          },
        });
        await new Promise((r) => setTimeout(r, 50));
        dispatch({
          type: 'SET_STATE',
          payload: {
            name: 'test-extension-2',
            state: ExtensionUpdateState.UPDATE_AVAILABLE,
          },
        });
        dispatch({ type: 'BATCH_CHECK_END' });
      },
    );

    renderHook(() =>
      useExtensionUpdates(
        extensions as GeminiCLIExtension[],
        extensionManager,
        addItem,
      ),
    );

    await waitFor(() => {
      expect(addItem).toHaveBeenCalledTimes(1);
      expect(addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: 'You have 2 extensions with an update available, run "/extensions list" for more information.',
        },
        expect.any(Number),
      );
    });
  });
});
