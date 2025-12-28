/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  updateExtension,
  updateAllUpdatableExtensions,
  checkForAllExtensionUpdates,
} from './update.js';
import {
  ExtensionUpdateState,
  type ExtensionUpdateStatus,
} from '../../ui/state/extensions.js';
import { ExtensionStorage } from './storage.js';
import { copyExtension } from '../extension-manager.js';
import { checkForExtensionUpdate } from './github.js';
import { loadInstallMetadata } from '../extension.js';
import * as fs from 'node:fs';
import type { ExtensionManager } from '../extension-manager.js';
import type { GeminiCLIExtension } from '@google/gemini-cli-core';

// Mock dependencies
vi.mock('./storage.js', () => ({
  ExtensionStorage: {
    createTmpDir: vi.fn(),
  },
}));

vi.mock('../extension-manager.js', () => ({
  copyExtension: vi.fn(),
  // We don't need to mock the class implementation if we pass a mock instance
}));

vi.mock('./github.js', () => ({
  checkForExtensionUpdate: vi.fn(),
}));

vi.mock('../extension.js', () => ({
  loadInstallMetadata: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      rm: vi.fn(),
    },
  };
});

describe('Extension Update Logic', () => {
  let mockExtensionManager: ExtensionManager;
  let mockDispatch: ReturnType<typeof vi.fn>;
  const mockExtension: GeminiCLIExtension = {
    name: 'test-extension',
    version: '1.0.0',
    path: '/path/to/extension',
  } as GeminiCLIExtension;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExtensionManager = {
      loadExtensionConfig: vi.fn(),
      installOrUpdateExtension: vi.fn(),
    } as unknown as ExtensionManager;
    mockDispatch = vi.fn();

    // Default mock behaviors
    vi.mocked(ExtensionStorage.createTmpDir).mockResolvedValue('/tmp/mock-dir');
    vi.mocked(loadInstallMetadata).mockReturnValue({
      source: 'https://example.com/repo.git',
      type: 'git',
    });
  });

  describe('updateExtension', () => {
    it('should return undefined if state is already UPDATING', async () => {
      const result = await updateExtension(
        mockExtension,
        mockExtensionManager,
        ExtensionUpdateState.UPDATING,
        mockDispatch,
      );
      expect(result).toBeUndefined();
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('should throw error and set state to ERROR if install metadata type is unknown', async () => {
      vi.mocked(loadInstallMetadata).mockReturnValue({
        type: undefined,
      } as unknown as import('@google/gemini-cli-core').ExtensionInstallMetadata);

      await expect(
        updateExtension(
          mockExtension,
          mockExtensionManager,
          ExtensionUpdateState.UPDATE_AVAILABLE,
          mockDispatch,
        ),
      ).rejects.toThrow('type is unknown');

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: mockExtension.name,
          state: ExtensionUpdateState.UPDATING,
        },
      });
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: mockExtension.name,
          state: ExtensionUpdateState.ERROR,
        },
      });
    });

    it('should throw error and set state to UP_TO_DATE if extension is linked', async () => {
      vi.mocked(loadInstallMetadata).mockReturnValue({
        type: 'link',
        source: '',
      });

      await expect(
        updateExtension(
          mockExtension,
          mockExtensionManager,
          ExtensionUpdateState.UPDATE_AVAILABLE,
          mockDispatch,
        ),
      ).rejects.toThrow('Extension is linked');

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: mockExtension.name,
          state: ExtensionUpdateState.UP_TO_DATE,
        },
      });
    });

    it('should successfully update extension and set state to UPDATED_NEEDS_RESTART by default', async () => {
      vi.mocked(mockExtensionManager.loadExtensionConfig).mockReturnValue(
        Promise.resolve({
          name: 'test-extension',
          version: '1.0.0',
        }),
      );
      vi.mocked(
        mockExtensionManager.installOrUpdateExtension,
      ).mockResolvedValue({
        ...mockExtension,
        version: '1.1.0',
      });

      const result = await updateExtension(
        mockExtension,
        mockExtensionManager,
        ExtensionUpdateState.UPDATE_AVAILABLE,
        mockDispatch,
      );

      expect(mockExtensionManager.installOrUpdateExtension).toHaveBeenCalled();
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: mockExtension.name,
          state: ExtensionUpdateState.UPDATED_NEEDS_RESTART,
        },
      });
      expect(result).toEqual({
        name: 'test-extension',
        originalVersion: '1.0.0',
        updatedVersion: '1.1.0',
      });
      expect(fs.promises.rm).toHaveBeenCalledWith('/tmp/mock-dir', {
        recursive: true,
        force: true,
      });
    });

    it('should set state to UPDATED if enableExtensionReloading is true', async () => {
      vi.mocked(mockExtensionManager.loadExtensionConfig).mockReturnValue(
        Promise.resolve({
          name: 'test-extension',
          version: '1.0.0',
        }),
      );
      vi.mocked(
        mockExtensionManager.installOrUpdateExtension,
      ).mockResolvedValue({
        ...mockExtension,
        version: '1.1.0',
      });

      await updateExtension(
        mockExtension,
        mockExtensionManager,
        ExtensionUpdateState.UPDATE_AVAILABLE,
        mockDispatch,
        true, // enableExtensionReloading
      );

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: mockExtension.name,
          state: ExtensionUpdateState.UPDATED,
        },
      });
    });

    it('should rollback and set state to ERROR if installation fails', async () => {
      vi.mocked(mockExtensionManager.loadExtensionConfig).mockReturnValue(
        Promise.resolve({
          name: 'test-extension',
          version: '1.0.0',
        }),
      );
      vi.mocked(
        mockExtensionManager.installOrUpdateExtension,
      ).mockRejectedValue(new Error('Install failed'));

      await expect(
        updateExtension(
          mockExtension,
          mockExtensionManager,
          ExtensionUpdateState.UPDATE_AVAILABLE,
          mockDispatch,
        ),
      ).rejects.toThrow('Updated extension not found after installation');

      expect(copyExtension).toHaveBeenCalledWith(
        '/tmp/mock-dir',
        mockExtension.path,
      );
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: mockExtension.name,
          state: ExtensionUpdateState.ERROR,
        },
      });
      expect(fs.promises.rm).toHaveBeenCalled();
    });
  });

  describe('updateAllUpdatableExtensions', () => {
    it('should update all extensions with UPDATE_AVAILABLE status', async () => {
      const extensions: GeminiCLIExtension[] = [
        { ...mockExtension, name: 'ext1' },
        { ...mockExtension, name: 'ext2' },
        { ...mockExtension, name: 'ext3' },
      ];
      const extensionsState = new Map([
        ['ext1', { status: ExtensionUpdateState.UPDATE_AVAILABLE }],
        ['ext2', { status: ExtensionUpdateState.UP_TO_DATE }],
        ['ext3', { status: ExtensionUpdateState.UPDATE_AVAILABLE }],
      ]);

      vi.mocked(mockExtensionManager.loadExtensionConfig).mockReturnValue(
        Promise.resolve({
          name: 'ext',
          version: '1.0.0',
        }),
      );
      vi.mocked(
        mockExtensionManager.installOrUpdateExtension,
      ).mockResolvedValue({ ...mockExtension, version: '1.1.0' });

      const results = await updateAllUpdatableExtensions(
        extensions,
        extensionsState as Map<string, ExtensionUpdateStatus>,
        mockExtensionManager,
        mockDispatch,
      );

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.name)).toEqual(['ext1', 'ext3']);
      expect(
        mockExtensionManager.installOrUpdateExtension,
      ).toHaveBeenCalledTimes(2);
    });
  });

  describe('checkForAllExtensionUpdates', () => {
    it('should dispatch BATCH_CHECK_START and BATCH_CHECK_END', async () => {
      await checkForAllExtensionUpdates([], mockExtensionManager, mockDispatch);

      expect(mockDispatch).toHaveBeenCalledWith({ type: 'BATCH_CHECK_START' });
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'BATCH_CHECK_END' });
    });

    it('should set state to NOT_UPDATABLE if no install metadata', async () => {
      const extensions: GeminiCLIExtension[] = [
        { ...mockExtension, installMetadata: undefined },
      ];

      await checkForAllExtensionUpdates(
        extensions,
        mockExtensionManager,
        mockDispatch,
      );

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: mockExtension.name,
          state: ExtensionUpdateState.NOT_UPDATABLE,
        },
      });
    });

    it('should check for updates and update state', async () => {
      const extensions: GeminiCLIExtension[] = [
        { ...mockExtension, installMetadata: { type: 'git', source: '...' } },
      ];
      vi.mocked(checkForExtensionUpdate).mockResolvedValue(
        ExtensionUpdateState.UPDATE_AVAILABLE,
      );

      await checkForAllExtensionUpdates(
        extensions,
        mockExtensionManager,
        mockDispatch,
      );

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: mockExtension.name,
          state: ExtensionUpdateState.CHECKING_FOR_UPDATES,
        },
      });
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_STATE',
        payload: {
          name: mockExtension.name,
          state: ExtensionUpdateState.UPDATE_AVAILABLE,
        },
      });
    });
  });
});
