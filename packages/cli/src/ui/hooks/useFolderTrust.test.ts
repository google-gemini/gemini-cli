/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFolderTrust } from './useFolderTrust.js';
import type { LoadedSettings } from '../../config/settings.js';
import { FolderTrustChoice } from '../components/FolderTrustDialog.js';
import type { LoadedTrustedFolders } from '../../config/trustedFolders.js';
import { TrustLevel } from '../../config/trustedFolders.js';
import * as process from 'node:process';

import * as trustedFolders from '../../config/trustedFolders.js';

vi.mock('process', () => ({
  cwd: vi.fn(),
  platform: 'linux',
}));

describe('useFolderTrust', () => {
  let mockSettings: LoadedSettings;
  let mockTrustedFolders: LoadedTrustedFolders;
  let loadTrustedFoldersSpy: vi.SpyInstance;
  let isWorkspaceTrustedSpy: vi.SpyInstance;
  let onTrustChange: (isTrusted: boolean | undefined) => void;
  let refreshStatic: () => void;

  beforeEach(() => {
    mockSettings = {
      merged: {
        security: {
          folderTrust: {
            enabled: true,
          },
        },
      },
      setValue: vi.fn(),
    } as unknown as LoadedSettings;

    mockTrustedFolders = {
      setValue: vi.fn(),
    } as unknown as LoadedTrustedFolders;

    loadTrustedFoldersSpy = vi
      .spyOn(trustedFolders, 'loadTrustedFolders')
      .mockReturnValue(mockTrustedFolders);
    isWorkspaceTrustedSpy = vi.spyOn(trustedFolders, 'isWorkspaceTrusted');
    (process.cwd as vi.Mock).mockReturnValue('/test/path');
    onTrustChange = vi.fn();
    refreshStatic = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should not open dialog when folder is already trusted', () => {
    isWorkspaceTrustedSpy.mockReturnValue(true);
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, refreshStatic),
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(false);
    expect(onTrustChange).toHaveBeenCalledWith(true);
  });

  it('should not open dialog when folder is already untrusted', () => {
    isWorkspaceTrustedSpy.mockReturnValue(false);
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, refreshStatic),
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(false);
    expect(onTrustChange).toHaveBeenCalledWith(false);
  });

  it('should open dialog when folder trust is undefined', () => {
    isWorkspaceTrustedSpy.mockReturnValue(undefined);
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, refreshStatic),
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(true);
    expect(onTrustChange).toHaveBeenCalledWith(undefined);
  });

  it('should handle TRUST_FOLDER choice', () => {
    isWorkspaceTrustedSpy
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(true);
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, refreshStatic),
    );

    isWorkspaceTrustedSpy.mockReturnValue(true);
    act(() => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.TRUST_FOLDER);
    });

    expect(loadTrustedFoldersSpy).toHaveBeenCalled();
    expect(mockTrustedFolders.setValue).toHaveBeenCalledWith(
      '/test/path',
      TrustLevel.TRUST_FOLDER,
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(false);
    expect(onTrustChange).toHaveBeenLastCalledWith(true);
  });

  it('should handle TRUST_PARENT choice', () => {
    isWorkspaceTrustedSpy
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(true);
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, refreshStatic),
    );

    act(() => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.TRUST_PARENT);
    });

    expect(mockTrustedFolders.setValue).toHaveBeenCalledWith(
      '/test/path',
      TrustLevel.TRUST_PARENT,
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(false);
    expect(onTrustChange).toHaveBeenLastCalledWith(true);
  });

  it('should handle DO_NOT_TRUST choice and trigger restart', () => {
    isWorkspaceTrustedSpy
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(false);
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, refreshStatic),
    );

    act(() => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.DO_NOT_TRUST);
    });

    expect(mockTrustedFolders.setValue).toHaveBeenCalledWith(
      '/test/path',
      TrustLevel.DO_NOT_TRUST,
    );
    expect(onTrustChange).toHaveBeenLastCalledWith(false);
    expect(result.current.isRestarting).toBe(true);
    expect(result.current.isFolderTrustDialogOpen).toBe(true);
  });

  it('should do nothing for default choice', () => {
    isWorkspaceTrustedSpy.mockReturnValue(undefined);
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, refreshStatic),
    );

    act(() => {
      result.current.handleFolderTrustSelect(
        'invalid_choice' as FolderTrustChoice,
      );
    });

    expect(mockTrustedFolders.setValue).not.toHaveBeenCalled();
    expect(mockSettings.setValue).not.toHaveBeenCalled();
    expect(result.current.isFolderTrustDialogOpen).toBe(true);
    expect(onTrustChange).toHaveBeenCalledWith(undefined);
  });

  it('should set isRestarting to true when trust status changes from false to true', () => {
    isWorkspaceTrustedSpy.mockReturnValueOnce(false).mockReturnValueOnce(true); // Initially untrusted, then trusted
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, refreshStatic),
    );

    act(() => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.TRUST_FOLDER);
    });

    expect(result.current.isRestarting).toBe(true);
    expect(result.current.isFolderTrustDialogOpen).toBe(true); // Dialog should stay open
  });

  it('should not set isRestarting to true when trust status does not change', () => {
    isWorkspaceTrustedSpy
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(true); // Initially undefined, then trust
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, refreshStatic),
    );

    act(() => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.TRUST_FOLDER);
    });

    expect(result.current.isRestarting).toBe(false);
    expect(result.current.isFolderTrustDialogOpen).toBe(false); // Dialog should close
  });

  it('should call refreshStatic when dialog opens and closes', () => {
    isWorkspaceTrustedSpy.mockReturnValue(undefined);
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, refreshStatic),
    );

    // The hook runs, isFolderTrustDialogOpen becomes true, useEffect triggers.
    // It's called once on mount, and once when the dialog state changes.
    expect(refreshStatic).toHaveBeenCalledTimes(2);
    expect(result.current.isFolderTrustDialogOpen).toBe(true);

    // Now, simulate closing the dialog
    isWorkspaceTrustedSpy.mockReturnValue(true); // So the state update works
    act(() => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.TRUST_FOLDER);
    });

    // The state isFolderTrustDialogOpen becomes false, useEffect triggers again
    expect(refreshStatic).toHaveBeenCalledTimes(3);
    expect(result.current.isFolderTrustDialogOpen).toBe(false);
  });
});
