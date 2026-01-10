/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
  type MockInstance,
} from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { useFolderTrust } from './useFolderTrust.js';
import type { LoadedSettings } from '../../config/settings.js';
import { FolderTrustChoice } from '../components/FolderTrustDialog.js';
import type { LoadedTrustedFolders } from '../../config/trustedFolders.js';
import { TrustLevel } from '../../config/trustedFolders.js';
import * as trustedFolders from '../../config/trustedFolders.js';
import { coreEvents, ExitCodes } from '@google/gemini-cli-core';

const mockedCwd = vi.hoisted(() => vi.fn());
const mockedExit = vi.hoisted(() => vi.fn());

vi.mock('node:process', async () => {
  const actual =
    await vi.importActual<typeof import('node:process')>('node:process');
  return {
    ...actual,
    cwd: mockedCwd,
    exit: mockedExit,
    platform: 'linux',
  };
});

describe('useFolderTrust', () => {
  let mockSettings: LoadedSettings;
  let mockTrustedFolders: LoadedTrustedFolders;
  let isWorkspaceTrustedSpy: MockInstance;
  let onTrustChange: (isTrusted: boolean | undefined) => void;
  let addItem: Mock;

  beforeEach(() => {
    vi.useFakeTimers();
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

    vi.spyOn(trustedFolders, 'loadTrustedFolders').mockReturnValue(
      mockTrustedFolders,
    );
    isWorkspaceTrustedSpy = vi.spyOn(trustedFolders, 'isWorkspaceTrusted');
    mockedCwd.mockReturnValue('/test/path');
    onTrustChange = vi.fn();
    addItem = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('should open dialog when folder trust is undefined', async () => {
    isWorkspaceTrustedSpy.mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
    );
    await waitFor(() => {
      expect(result.current.isFolderTrustDialogOpen).toBe(true);
    });
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

  it('should handle TRUST_FOLDER choice and trigger restart', async () => {
    isWorkspaceTrustedSpy.mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });

    (mockTrustedFolders.setValue as Mock).mockImplementation(() => {
      isWorkspaceTrustedSpy.mockReturnValue({
        isTrusted: true,
        source: 'file',
      });
    });

    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
    );

    await waitFor(() => {
      expect(result.current.isTrusted).toBeUndefined();
    });

    await act(async () => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.TRUST_FOLDER);
    });

    await waitFor(() => {
      expect(mockTrustedFolders.setValue).toHaveBeenCalledWith(
        '/test/path',
        TrustLevel.TRUST_FOLDER,
      );
      expect(result.current.isRestarting).toBe(true);
      expect(result.current.isFolderTrustDialogOpen).toBe(true);
      expect(onTrustChange).toHaveBeenLastCalledWith(true);
    });
  });

  it('should handle TRUST_PARENT choice and trigger restart', async () => {
    isWorkspaceTrustedSpy.mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
    );

    await act(async () => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.TRUST_PARENT);
    });

    await waitFor(() => {
      expect(mockTrustedFolders.setValue).toHaveBeenCalledWith(
        '/test/path',
        TrustLevel.TRUST_PARENT,
      );
      expect(result.current.isRestarting).toBe(true);
      expect(result.current.isFolderTrustDialogOpen).toBe(true);
      expect(onTrustChange).toHaveBeenLastCalledWith(true);
    });
  });

  it('should handle DO_NOT_TRUST choice and NOT trigger restart (implicit -> explicit)', async () => {
    isWorkspaceTrustedSpy.mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
    );

    await act(async () => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.DO_NOT_TRUST);
    });

    await waitFor(() => {
      expect(mockTrustedFolders.setValue).toHaveBeenCalledWith(
        '/test/path',
        TrustLevel.DO_NOT_TRUST,
      );
      expect(onTrustChange).toHaveBeenLastCalledWith(false);
      expect(result.current.isRestarting).toBe(false);
      expect(result.current.isFolderTrustDialogOpen).toBe(false);
    });
  });

  it('should do nothing for default choice', async () => {
    isWorkspaceTrustedSpy.mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
    );

    await act(async () => {
      result.current.handleFolderTrustSelect(
        'invalid_choice' as FolderTrustChoice,
      );
    });

    await waitFor(() => {
      expect(mockTrustedFolders.setValue).not.toHaveBeenCalled();
      expect(mockSettings.setValue).not.toHaveBeenCalled();
      expect(result.current.isFolderTrustDialogOpen).toBe(true);
      expect(onTrustChange).toHaveBeenCalledWith(undefined);
    });
  });

  it('should set isRestarting to true when trust status changes from false to true', async () => {
    isWorkspaceTrustedSpy.mockReturnValue({ isTrusted: false, source: 'file' }); // Initially untrusted

    (mockTrustedFolders.setValue as Mock).mockImplementation(() => {
      isWorkspaceTrustedSpy.mockReturnValue({
        isTrusted: true,
        source: 'file',
      });
    });

    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
    );

    await waitFor(() => {
      expect(result.current.isTrusted).toBe(false);
    });

    await act(async () => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.TRUST_FOLDER);
    });

    await waitFor(() => {
      expect(result.current.isRestarting).toBe(true);
      expect(result.current.isFolderTrustDialogOpen).toBe(true); // Dialog should stay open
    });
  });

  it('should not set isRestarting to true when trust status does not change (true -> true)', async () => {
    isWorkspaceTrustedSpy.mockReturnValue({
      isTrusted: true,
      source: 'file',
    });
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
    );

    await act(async () => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.TRUST_FOLDER);
    });

    await waitFor(() => {
      expect(result.current.isRestarting).toBe(false);
      expect(result.current.isFolderTrustDialogOpen).toBe(false); // Dialog should close
    });
  });

  it('should emit feedback on failure to set value', async () => {
    isWorkspaceTrustedSpy.mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    (mockTrustedFolders.setValue as Mock).mockImplementation(() => {
      throw new Error('test error');
    });
    const emitFeedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');
    const { result } = renderHook(() =>
      useFolderTrust(mockSettings, onTrustChange, addItem),
    );

    act(() => {
      result.current.handleFolderTrustSelect(FolderTrustChoice.TRUST_FOLDER);
    });

    await vi.runAllTimersAsync();

    expect(emitFeedbackSpy).toHaveBeenCalledWith(
      'error',
      'Failed to save trust settings. Exiting Gemini CLI.',
    );
    expect(mockedExit).toHaveBeenCalledWith(ExitCodes.FATAL_CONFIG_ERROR);
  });
});
