/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vitest/globals" />

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePermissionsModifyTrust } from './usePermissionsModifyTrust.js';
import { TrustLevel } from '../../config/trustedFolders.js';
import type { LoadedSettings } from '../../config/settings.js';
import type { LoadedTrustedFolders } from '../../config/trustedFolders.js';

// Hoist mocks
const mockedCwd = vi.hoisted(() => vi.fn());
const mockedLoadTrustedFolders = vi.hoisted(() => vi.fn());
const mockedIsWorkspaceTrusted = vi.hoisted(() => vi.fn());
const mockedUseSettings = vi.hoisted(() => vi.fn());

// Mock modules
vi.mock('node:process', () => ({
  cwd: mockedCwd,
}));

vi.mock('../../config/trustedFolders.js', () => ({
  loadTrustedFolders: mockedLoadTrustedFolders,
  isWorkspaceTrusted: mockedIsWorkspaceTrusted,
  TrustLevel: {
    TRUST_FOLDER: 'TRUST_FOLDER',
    TRUST_PARENT: 'TRUST_PARENT',
    DO_NOT_TRUST: 'DO_NOT_TRUST',
  },
}));

vi.mock('../contexts/SettingsContext.js', () => ({
  useSettings: mockedUseSettings,
}));

describe('usePermissionsModifyTrust', () => {
  let mockOnExit: Mock;
  let mockAddItem: Mock;

  beforeEach(() => {
    mockAddItem = vi.fn();
    mockOnExit = vi.fn();

    mockedCwd.mockReturnValue('/test/dir');
    mockedUseSettings.mockReturnValue({
      merged: {
        security: {
          folderTrust: {
            enabled: true,
          },
        },
      },
    } as LoadedSettings);
    mockedIsWorkspaceTrusted.mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should initialize with the correct trust level', () => {
    mockedLoadTrustedFolders.mockReturnValue({
      user: { config: { '/test/dir': TrustLevel.TRUST_FOLDER } },
    } as unknown as LoadedTrustedFolders);
    mockedIsWorkspaceTrusted.mockReturnValue({
      isTrusted: true,
      source: 'file',
    });

    const { result } = renderHook(() =>
      usePermissionsModifyTrust(mockOnExit, mockAddItem),
    );

    expect(result.current.currentTrustLevel).toBe(TrustLevel.TRUST_FOLDER);
  });

  it('should detect inherited trust from parent', () => {
    mockedLoadTrustedFolders.mockReturnValue({
      user: { config: {} },
      setValue: vi.fn(),
    } as unknown as LoadedTrustedFolders);
    mockedIsWorkspaceTrusted.mockReturnValue({
      isTrusted: true,
      source: 'file',
    });

    const { result } = renderHook(() =>
      usePermissionsModifyTrust(mockOnExit, mockAddItem),
    );

    expect(result.current.isInheritedTrustFromParent).toBe(true);
    expect(result.current.isInheritedTrustFromIde).toBe(false);
  });

  it('should detect inherited trust from IDE', () => {
    mockedLoadTrustedFolders.mockReturnValue({
      user: { config: {} }, // No explicit trust
    } as unknown as LoadedTrustedFolders);
    mockedIsWorkspaceTrusted.mockReturnValue({
      isTrusted: true,
      source: 'ide',
    });

    const { result } = renderHook(() =>
      usePermissionsModifyTrust(mockOnExit, mockAddItem),
    );

    expect(result.current.isInheritedTrustFromIde).toBe(true);
    expect(result.current.isInheritedTrustFromParent).toBe(false);
  });

  it('should set needsRestart but not save when trust changes', () => {
    const mockSetValue = vi.fn();
    mockedLoadTrustedFolders.mockReturnValue({
      user: { config: {} },
      setValue: mockSetValue,
    } as unknown as LoadedTrustedFolders);

    mockedIsWorkspaceTrusted
      .mockReturnValueOnce({ isTrusted: false, source: 'file' })
      .mockReturnValueOnce({ isTrusted: true, source: 'file' });

    const { result } = renderHook(() =>
      usePermissionsModifyTrust(mockOnExit, mockAddItem),
    );

    act(() => {
      result.current.updateTrustLevel(TrustLevel.TRUST_FOLDER);
    });

    expect(result.current.needsRestart).toBe(true);
    expect(mockSetValue).not.toHaveBeenCalled();
  });

  it('should save immediately if trust does not change', () => {
    const mockSetValue = vi.fn();
    mockedLoadTrustedFolders.mockReturnValue({
      user: { config: {} },
      setValue: mockSetValue,
    } as unknown as LoadedTrustedFolders);

    mockedIsWorkspaceTrusted.mockReturnValue({
      isTrusted: true,
      source: 'file',
    });

    const { result } = renderHook(() =>
      usePermissionsModifyTrust(mockOnExit, mockAddItem),
    );

    act(() => {
      result.current.updateTrustLevel(TrustLevel.TRUST_PARENT);
    });

    expect(result.current.needsRestart).toBe(false);
    expect(mockSetValue).toHaveBeenCalledWith(
      '/test/dir',
      TrustLevel.TRUST_PARENT,
    );
    expect(mockOnExit).toHaveBeenCalled();
  });

  it('should commit the pending trust level change', () => {
    const mockSetValue = vi.fn();
    mockedLoadTrustedFolders.mockReturnValue({
      user: { config: {} },
      setValue: mockSetValue,
    } as unknown as LoadedTrustedFolders);

    mockedIsWorkspaceTrusted
      .mockReturnValueOnce({ isTrusted: false, source: 'file' })
      .mockReturnValueOnce({ isTrusted: true, source: 'file' });

    const { result } = renderHook(() =>
      usePermissionsModifyTrust(mockOnExit, mockAddItem),
    );

    act(() => {
      result.current.updateTrustLevel(TrustLevel.TRUST_FOLDER);
    });

    expect(result.current.needsRestart).toBe(true);

    act(() => {
      result.current.commitTrustLevelChange();
    });

    expect(mockSetValue).toHaveBeenCalledWith(
      '/test/dir',
      TrustLevel.TRUST_FOLDER,
    );
  });

  it('should add warning when setting DO_NOT_TRUST but still trusted by parent', () => {
    mockedLoadTrustedFolders.mockReturnValue({
      user: { config: {} },
      setValue: vi.fn(),
    } as unknown as LoadedTrustedFolders);
    mockedIsWorkspaceTrusted.mockReturnValue({
      isTrusted: true,
      source: 'file',
    });

    const { result } = renderHook(() =>
      usePermissionsModifyTrust(mockOnExit, mockAddItem),
    );

    act(() => {
      result.current.updateTrustLevel(TrustLevel.DO_NOT_TRUST);
    });

    expect(mockAddItem).toHaveBeenCalledWith(
      {
        type: 'warning',
        text: 'Note: This folder is still trusted because a parent folder is trusted.',
      },
      expect.any(Number),
    );
  });

  it('should add warning when setting DO_NOT_TRUST but still trusted by IDE', () => {
    mockedLoadTrustedFolders.mockReturnValue({
      user: { config: {} },
      setValue: vi.fn(),
    } as unknown as LoadedTrustedFolders);
    mockedIsWorkspaceTrusted.mockReturnValue({
      isTrusted: true,
      source: 'ide',
    });

    const { result } = renderHook(() =>
      usePermissionsModifyTrust(mockOnExit, mockAddItem),
    );

    act(() => {
      result.current.updateTrustLevel(TrustLevel.DO_NOT_TRUST);
    });

    expect(mockAddItem).toHaveBeenCalledWith(
      {
        type: 'warning',
        text: 'Note: This folder is still trusted because the connected IDE workspace is trusted.',
      },
      expect.any(Number),
    );
  });
});
