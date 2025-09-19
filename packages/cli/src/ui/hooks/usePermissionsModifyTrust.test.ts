/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePermissionsModifyTrust } from './usePermissionsModifyTrust.js';
import * as trustedFolders from '../../config/trustedFolders.js';
import * as processUtils from '../../utils/processUtils.js';
import { TrustLevel } from '../../config/trustedFolders.js';
import * as process from 'node:process';
import * as SettingsContext from '../contexts/SettingsContext.js';
import type { LoadedSettings } from '../../config/settings.js';
import type { LoadedTrustedFolders } from '../../config/trustedFolders.js';

// Mock dependencies at the top
vi.mock('node:process', () => ({
  cwd: vi.fn(),
}));

describe('usePermissionsModifyTrust', () => {
  let loadTrustedFoldersSpy: vi.SpyInstance;
  let isWorkspaceTrustedSpy: vi.SpyInstance;
  let relaunchAppSpy: vi.SpyInstance;
  let useSettingsSpy: vi.SpyInstance;
  let mockOnExit: vi.Mock;

  beforeEach(() => {
    // Spy on the functions we need to control
    loadTrustedFoldersSpy = vi.spyOn(trustedFolders, 'loadTrustedFolders');
    isWorkspaceTrustedSpy = vi.spyOn(trustedFolders, 'isWorkspaceTrusted');
    relaunchAppSpy = vi.spyOn(processUtils, 'relaunchApp').mockResolvedValue();
    useSettingsSpy = vi.spyOn(SettingsContext, 'useSettings');

    // Setup default mock implementations
    (process.cwd as vi.Mock).mockReturnValue('/test/dir');
    useSettingsSpy.mockReturnValue({
      merged: {
        security: {
          folderTrust: {
            enabled: true,
          },
        },
      },
    } as LoadedSettings);
    mockOnExit = vi.fn();
  });

  afterEach(() => {
    // Restore all spies
    vi.restoreAllMocks();
  });

  it('should return isFolderTrustEnabled as true when enabled in settings', () => {
    const { result } = renderHook(() => usePermissionsModifyTrust(mockOnExit));
    expect(result.current.isFolderTrustEnabled).toBe(true);
  });

  it('should return isFolderTrustEnabled as false when disabled in settings', () => {
    useSettingsSpy.mockReturnValue({
      merged: {
        security: {
          folderTrust: {
            enabled: false,
          },
        },
      },
    } as LoadedSettings);
    const { result } = renderHook(() => usePermissionsModifyTrust(mockOnExit));
    expect(result.current.isFolderTrustEnabled).toBe(false);
  });

  it('should initialize with the correct trust level', () => {
    loadTrustedFoldersSpy.mockReturnValue({
      user: { config: { '/test/dir': TrustLevel.TRUST_FOLDER } },
    } as LoadedTrustedFolders);
    isWorkspaceTrustedSpy.mockReturnValue(true);

    const { result } = renderHook(() => usePermissionsModifyTrust(mockOnExit));

    expect(result.current.currentTrustLevel).toBe(TrustLevel.TRUST_FOLDER);
    expect(result.current.loading).toBe(false);
  });

  it('should detect inherited trust', () => {
    loadTrustedFoldersSpy.mockReturnValue({
      user: { config: {} },
    } as LoadedTrustedFolders);
    isWorkspaceTrustedSpy.mockReturnValue(true);

    const { result } = renderHook(() => usePermissionsModifyTrust(mockOnExit));

    expect(result.current.isInheritedTrust).toBe(true);
  });

  it('should update trust level and restart when trust changes', async () => {
    vi.useFakeTimers();
    const mockSetValue = vi.fn();
    loadTrustedFoldersSpy.mockReturnValue({
      user: { config: {} },
      setValue: mockSetValue,
    } as unknown as LoadedTrustedFolders);

    isWorkspaceTrustedSpy.mockReturnValue(false);
    const { result } = renderHook(() => usePermissionsModifyTrust(mockOnExit));

    isWorkspaceTrustedSpy.mockReturnValueOnce(false).mockReturnValueOnce(true);

    act(() => {
      result.current.updateTrustLevel(TrustLevel.TRUST_FOLDER);
    });

    expect(result.current.needsRestart).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(mockSetValue).toHaveBeenCalledWith(
      '/test/dir',
      TrustLevel.TRUST_FOLDER,
    );
    expect(relaunchAppSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
