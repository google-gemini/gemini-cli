/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { act } from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  IdeClient,
  IDEConnectionStatus,
  ideContextStore,
  type IDEConnectionState,
} from '@google/gemini-cli-core';
import { useIdeTrustListener } from './useIdeTrustListener.js';
import * as trustedFolders from '../../config/trustedFolders.js';
import { useSettings } from '../contexts/SettingsContext.js';
import type { LoadedSettings } from '../../config/settings.js';

// Mock dependencies
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  const ideClientInstance = {
    addTrustChangeListener: vi.fn(),
    removeTrustChangeListener: vi.fn(),
    addStatusChangeListener: vi.fn(),
    removeStatusChangeListener: vi.fn(),
    getConnectionStatus: vi.fn(() => ({
      status: IDEConnectionStatus.Disconnected,
    })),
  };
  return {
    ...original,
    IdeClient: {
      getInstance: vi.fn().mockResolvedValue(ideClientInstance),
    },
    ideContextStore: {
      get: vi.fn(),
      subscribe: vi.fn(),
    },
  };
});

vi.mock('../../config/trustedFolders.js');
vi.mock('../contexts/SettingsContext.js');

describe('useIdeTrustListener', () => {
  let mockSettings: LoadedSettings;
  let mockIdeClient: Awaited<ReturnType<typeof IdeClient.getInstance>>;
  let trustChangeCallback: (isTrusted: boolean) => void;
  let statusChangeCallback: (state: IDEConnectionState) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockIdeClient = await IdeClient.getInstance();

    mockSettings = {
      merged: {
        security: {
          folderTrust: {
            enabled: true,
          },
        },
      },
    } as LoadedSettings;

    vi.mocked(useSettings).mockReturnValue(mockSettings);

    vi.mocked(mockIdeClient.addTrustChangeListener).mockImplementation((cb) => {
      trustChangeCallback = cb;
    });
    vi.mocked(mockIdeClient.addStatusChangeListener).mockImplementation(
      (cb) => {
        statusChangeCallback = cb;
      },
    );
  });

  const renderTrustListenerHook = async () => {
    let hookResult: ReturnType<typeof useIdeTrustListener>;
    function TestComponent() {
      hookResult = useIdeTrustListener();
      return null;
    }
    const { rerender, unmount } = render(<TestComponent />);

    // Flush any pending async state updates from the hook's initialization
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      rerender: async () => {
        rerender(<TestComponent />);
      },
      unmount: async () => {
        unmount();
      },
    };
  };

  it('should initialize correctly with no trust information', async () => {
    vi.mocked(trustedFolders.isWorkspaceTrusted).mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });

    const { result, unmount } = await renderTrustListenerHook();

    expect(result.current.isIdeTrusted).toBe(undefined);
    expect(result.current.needsRestart).toBe(false);
    expect(result.current.restartReason).toBe('NONE');
    await unmount();
  });

  it('should NOT set needsRestart when connecting for the first time', async () => {
    vi.mocked(mockIdeClient.getConnectionStatus).mockReturnValue({
      status: IDEConnectionStatus.Disconnected,
    });
    vi.mocked(trustedFolders.isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: 'ide',
    });
    const { result, unmount } = await renderTrustListenerHook();

    // Manually trigger the initial connection state for the test setup
    await act(async () => {
      statusChangeCallback({ status: IDEConnectionStatus.Disconnected });
    });

    expect(result.current.isIdeTrusted).toBe(undefined);
    expect(result.current.needsRestart).toBe(false);

    await act(async () => {
      vi.mocked(ideContextStore.get).mockReturnValue({
        workspaceState: { isTrusted: true },
      });
      statusChangeCallback({ status: IDEConnectionStatus.Connected });
    });

    expect(result.current.isIdeTrusted).toBe(true);
    expect(result.current.needsRestart).toBe(false);
    expect(result.current.restartReason).toBe('CONNECTION_CHANGE');
    await unmount();
  });

  it('should set needsRestart when IDE trust changes', async () => {
    vi.mocked(mockIdeClient.getConnectionStatus).mockReturnValue({
      status: IDEConnectionStatus.Connected,
    });
    vi.mocked(ideContextStore.get).mockReturnValue({
      workspaceState: { isTrusted: true },
    });
    vi.mocked(trustedFolders.isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: 'ide',
    });

    const { result, unmount } = await renderTrustListenerHook();

    // Manually trigger the initial connection state for the test setup
    await act(async () => {
      statusChangeCallback({ status: IDEConnectionStatus.Connected });
    });

    expect(result.current.isIdeTrusted).toBe(true);
    expect(result.current.needsRestart).toBe(false);

    await act(async () => {
      vi.mocked(trustedFolders.isWorkspaceTrusted).mockReturnValue({
        isTrusted: false,
        source: 'ide',
      });
      vi.mocked(ideContextStore.get).mockReturnValue({
        workspaceState: { isTrusted: false },
      });
      trustChangeCallback(false);
    });

    expect(result.current.isIdeTrusted).toBe(false);
    expect(result.current.needsRestart).toBe(true);
    expect(result.current.restartReason).toBe('TRUST_CHANGE');
    await unmount();
  });

  it('should set needsRestart when IDE disconnects', async () => {
    vi.mocked(mockIdeClient.getConnectionStatus).mockReturnValue({
      status: IDEConnectionStatus.Connected,
    });
    vi.mocked(ideContextStore.get).mockReturnValue({
      workspaceState: { isTrusted: true },
    });
    vi.mocked(trustedFolders.isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: 'ide',
    });

    const { result, unmount } = await renderTrustListenerHook();

    // Manually trigger the initial connection state for the test setup
    await act(async () => {
      statusChangeCallback({ status: IDEConnectionStatus.Connected });
    });

    expect(result.current.isIdeTrusted).toBe(true);
    expect(result.current.needsRestart).toBe(false);

    await act(async () => {
      vi.mocked(trustedFolders.isWorkspaceTrusted).mockReturnValue({
        isTrusted: undefined,
        source: undefined,
      });
      vi.mocked(ideContextStore.get).mockReturnValue(undefined);
      statusChangeCallback({ status: IDEConnectionStatus.Disconnected });
    });

    expect(result.current.isIdeTrusted).toBe(undefined);
    expect(result.current.needsRestart).toBe(true);
    expect(result.current.restartReason).toBe('CONNECTION_CHANGE');
    await unmount();
  });

  it('should NOT set needsRestart if trust value does not change', async () => {
    vi.mocked(mockIdeClient.getConnectionStatus).mockReturnValue({
      status: IDEConnectionStatus.Connected,
    });
    vi.mocked(ideContextStore.get).mockReturnValue({
      workspaceState: { isTrusted: true },
    });
    vi.mocked(trustedFolders.isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: 'ide',
    });

    const { result, rerender, unmount } = await renderTrustListenerHook();

    // Manually trigger the initial connection state for the test setup
    await act(async () => {
      statusChangeCallback({ status: IDEConnectionStatus.Connected });
    });

    expect(result.current.isIdeTrusted).toBe(true);
    expect(result.current.needsRestart).toBe(false);

    await rerender();

    expect(result.current.isIdeTrusted).toBe(true);
    expect(result.current.needsRestart).toBe(false);
    await unmount();
  });
});
