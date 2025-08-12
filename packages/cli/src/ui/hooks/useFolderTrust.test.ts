/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFolderTrust } from './useFolderTrust.js';
import { type Config } from '@google/gemini-cli-core';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { FolderTrustChoice } from '../components/FolderTrustDialog.js';
import { loadTrustedFolders, TrustLevel } from '../../config/trustedFolders.js';
import * as process from 'process';

// Mock dependencies
vi.mock('../../config/trustedFolders.js', () => ({
  loadTrustedFolders: vi.fn(),
  TrustLevel: {
    TRUST_FOLDER: 'trust_folder',
    TRUST_PARENT: 'trust_parent',
    DO_NOT_TRUST: 'do_not_trust',
  },
}));

vi.mock('process', () => ({
  cwd: vi.fn(),
  platform: 'linux',
}));

describe('useFolderTrust', () => {
  let mockSettings: LoadedSettings;
  let mockConfig: Config;
  let mockTrustedFolders: { setValue: vi.Mock };

  beforeEach(() => {
    mockSettings = {
      merged: {
        folderTrustFeature: true,
        folderTrust: undefined,
      },
      setValue: vi.fn(),
    } as unknown as LoadedSettings;

    mockConfig = {
      isTrustedFolder: vi.fn().mockReturnValue(undefined),
    } as unknown as Config;

    mockTrustedFolders = {
      setValue: vi.fn(),
    };

    (loadTrustedFolders as vi.Mock).mockReturnValue(mockTrustedFolders);
    (process.cwd as vi.Mock).mockReturnValue('/test/path');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should open dialog when feature is enabled and trust is not set', () => {
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, mockConfig),
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(true);
  });

  it('should not open dialog when feature is disabled', () => {
    mockSettings.merged.folderTrustFeature = false;
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, mockConfig),
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(false);
  });

  it('should not open dialog when folder trust is explicitly false', () => {
    mockSettings.merged.folderTrust = false;
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, mockConfig),
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(false);
  });

  it('should not open dialog when folder is already trusted', () => {
    (mockConfig.isTrustedFolder as vi.Mock).mockReturnValue(true);
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, mockConfig),
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(false);
  });

  it('should handle TRUST_FOLDER choice', () => {
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, mockConfig),
    );

    act(() => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.TRUST_FOLDER);
    });

    expect(loadTrustedFolders).toHaveBeenCalled();
    expect(mockTrustedFolders.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      '/test/path',
      TrustLevel.TRUST_FOLDER,
    );
    expect(mockSettings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'folderTrust',
      true,
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(false);
  });

  it('should handle TRUST_PARENT choice', () => {
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, mockConfig),
    );

    act(() => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.TRUST_PARENT);
    });

    expect(mockTrustedFolders.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      '/test/path',
      TrustLevel.TRUST_PARENT,
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(false);
  });

  it('should handle DO_NOT_TRUST choice', () => {
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, mockConfig),
    );

    act(() => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.DO_NOT_TRUST);
    });

    expect(mockTrustedFolders.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      '/test/path',
      TrustLevel.DO_NOT_TRUST,
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(false);
  });

  it('should do nothing for default choice', () => {
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, mockConfig),
    );

    act(() => {
      result.current.handleFolderTrustSelect(
        'invalid_choice' as FolderTrustChoice,
      );
    });

    expect(mockTrustedFolders.setValue).not.toHaveBeenCalled();
    expect(mockSettings.setValue).not.toHaveBeenCalled();
    expect(result.current.isFolderTrustDialogOpen).toBe(true);
  });
});
