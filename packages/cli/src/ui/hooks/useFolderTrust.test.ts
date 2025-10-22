/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, type Mock, type MockInstance } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFolderTrust } from './useFolderTrust.js';
import type { LoadedSettings } from '../../config/settings.js';
import { FolderTrustChoice } from '../components/FolderTrustDialog.js';
import type { LoadedTrustedFolders } from '../../config/trustedFolders.js';
import { TrustLevel } from '../../config/trustedFolders.js';
import * as trustedFolders from '../../config/trustedFolders.js';

const mockedCwd = vi.hoisted(() => vi.fn());

vi.mock('node:process', async () => {
  const actual =
    await vi.importActual<typeof import('node:process')>('node:process');
  return {
    ...actual,
    cwd: mockedCwd,
    platform: 'linux',
  };
});

describe('useFolderTrust', () => {
  let mockSettings: LoadedSettings;
  let mockTrustedFolders: LoadedTrustedFolders;
  let loadTrustedFoldersSpy: MockInstance;
  let isWorkspaceTrustedSpy: MockInstance;
  let onTrustChange: (isTrusted: boolean | undefined) => void;
  let addItem: Mock;

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
    mockedCwd.mockReturnValue('/test/path');
    onTrustChange = vi.fn();
    addItem = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should not open dialog when folder is already trusted', () => {
    isWorkspaceTrustedSpy.mockReturnValue({ isTrusted: true, source: 'file' });
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(false);
    expect(onTrustChange).toHaveBeenCalledWith(true);
  });

  it('should not open dialog when folder is already untrusted', () => {
    isWorkspaceTrustedSpy.mockReturnValue({ isTrusted: false, source: 'file' });
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(false);
    expect(onTrustChange).toHaveBeenCalledWith(false);
  });

  it('should open dialog when folder trust is undefined', () => {
    isWorkspaceTrustedSpy.mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
    );
    expect(result.current.isFolderTrustDialogOpen).toBe(true);
    expect(onTrustChange).toHaveBeenCalledWith(undefined);
  });

  it('should send a message if the folder is untrusted', () => {
    isWorkspaceTrustedSpy.mockReturnValue({ isTrusted: false, source: 'file' });
    renderHook(() => useFolderTrust(mockSettings, onTrustChange, addItem));
    expect(addItem).toHaveBeenCalledWith(
      {
        text: 'This folder is not trusted. Some features may be disabled. Use the `/permissions` command to change the trust level.',
        type: 'info',
      },
      expect.any(Number),
    );
  });

  it('should not send a message if the folder is trusted', () => {
    isWorkspaceTrustedSpy.mockReturnValue({ isTrusted: true, source: 'file' });
    renderHook(() => useFolderTrust(mockSettings, onTrustChange, addItem));
    expect(addItem).not.toHaveBeenCalled();
  });

  it('should handle TRUST_FOLDER choice', () => {
    isWorkspaceTrustedSpy.mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
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
    expect(onTrustChange).toHaveBeenLastCalledWith(true);
  });

  it('should handle TRUST_PARENT choice', () => {
    isWorkspaceTrustedSpy.mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
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
    isWorkspaceTrustedSpy.mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
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
    isWorkspaceTrustedSpy.mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
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
    isWorkspaceTrustedSpy.mockReturnValue({ isTrusted: false, source: 'file' }); // Initially untrusted
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
    );

    act(() => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.TRUST_FOLDER);
    });

    expect(result.current.isRestarting).toBe(true);
    expect(result.current.isFolderTrustDialogOpen).toBe(true); // Dialog should stay open
  });

  it('should not set isRestarting to true when trust status does not change', () => {
    isWorkspaceTrustedSpy.mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
    );

    act(() => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.TRUST_FOLDER);
    });

    expect(result.current.isRestarting).toBe(false);
    expect(result.current.isFolderTrustDialogOpen).toBe(false); // Dialog should close
  });
});
