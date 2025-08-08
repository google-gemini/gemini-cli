/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useFolderTrust } from './useFolderTrust.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { FolderTrustChoice } from '../components/FolderTrustDialog.js';

describe('useFolderTrust', () => {
  it('should set isFolderTrustDialogOpen to true when folderTrustFeature is true and folderTrust is undefined', () => {
    const settings = {
      merged: {
        folderTrustFeature: true,
        folderTrust: undefined,
      },
      setValue: vi.fn(),
    } as unknown as LoadedSettings;

    const { result } = renderHook(() => useFolderTrust(settings));

    expect(result.current.isFolderTrustDialogOpen).toBe(true);
  });

  it('should set isFolderTrustDialogOpen to false when folderTrustFeature is false', () => {
    const settings = {
      merged: {
        folderTrustFeature: false,
        folderTrust: undefined,
      },
      setValue: vi.fn(),
    } as unknown as LoadedSettings;

    const { result } = renderHook(() => useFolderTrust(settings));

    expect(result.current.isFolderTrustDialogOpen).toBe(false);
  });

  it('should set isFolderTrustDialogOpen to false when folderTrust is defined', () => {
    const settings = {
      merged: {
        folderTrustFeature: true,
        folderTrust: true,
      },
      setValue: vi.fn(),
    } as unknown as LoadedSettings;

    const { result } = renderHook(() => useFolderTrust(settings));

    expect(result.current.isFolderTrustDialogOpen).toBe(false);
  });

  it('should call setValue and set isFolderTrustDialogOpen to false on handleFolderTrustSelect', () => {
    const settings = {
      merged: {
        folderTrustFeature: true,
        folderTrust: undefined,
      },
      setValue: vi.fn(),
    } as unknown as LoadedSettings;

    const { result } = renderHook(() => useFolderTrust(settings));

    act(() => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.TRUST_FOLDER);
    });

    expect(settings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'folderTrust',
      true,
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(false);
  });
});
