/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFolderTrust } from './useFolderTrust.js';
import { type Config } from '@google/gemini-cli-core';
import { LoadedSettings } from '../../config/settings.js';
import { FolderTrustChoice } from '../components/FolderTrustDialog.js';
import {
  LoadedTrustedFolders,
  TrustLevel,
} from '../../config/trustedFolders.js';
import * as process from 'process';

import * as trustedFolders from '../../config/trustedFolders.js';

vi.mock('process', () => ({
  cwd: vi.fn(),
  platform: 'linux',
}));

describe('useFolderTrust', () => {
  let mockSettings: LoadedSettings;
  let mockConfig: Config;
  let mockTrustedFolders: LoadedTrustedFolders;
  let loadTrustedFoldersSpy: vi.SpyInstance;

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
    } as unknown as LoadedTrustedFolders;

    loadTrustedFoldersSpy = vi
      .spyOn(trustedFolders, 'loadTrustedFolders')
      .mockReturnValue(mockTrustedFolders);
    (process.cwd as vi.Mock).mockReturnValue('/test/path');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should not open dialog when folder is already trusted', () => {
    (mockConfig.isTrustedFolder as vi.Mock).mockReturnValue(true);
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, mockConfig),
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(false);
  });

  it('should not open dialog when folder is already untrusted', () => {
    (mockConfig.isTrustedFolder as vi.Mock).mockReturnValue(false);
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, mockConfig),
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(false);
  });

  it('should open dialog when folder trust is undefined', () => {
    (mockConfig.isTrustedFolder as vi.Mock).mockReturnValue(undefined);
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, mockConfig),
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(true);
  });

  it('should handle TRUST_FOLDER choice', () => {
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, mockConfig),
    );

    act(() => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.TRUST_FOLDER);
    });

    expect(loadTrustedFoldersSpy).toHaveBeenCalled();
    expect(mockTrustedFolders.setValue).toHaveBeenCalledWith(
      '/test/path',
      TrustLevel.TRUST_FOLDER,
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
