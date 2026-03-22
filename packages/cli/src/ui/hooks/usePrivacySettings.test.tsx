/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import {
  UserTierId,
  getCodeAssistServer,
  type Config,
  type CodeAssistServer,
} from '@google/gemini-cli-core';
import { usePrivacySettings } from './usePrivacySettings.js';
import { waitFor } from '../../test-utils/async.js';

// Mock the dependencies
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    getCodeAssistServer: vi.fn(),
  };
});

describe('usePrivacySettings', () => {
  const mockConfig = {} as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderPrivacySettingsHook = async () => {
    let hookResult: ReturnType<typeof usePrivacySettings>;
    function TestComponent() {
      hookResult = usePrivacySettings(mockConfig);
      return null;
    }
    await render(<TestComponent />);
    return {
      result: {
        get current() {
          return hookResult;
        },
      },
    };
  };

  it('should throw error when content generator is not a CodeAssistServer', async () => {
    vi.mocked(getCodeAssistServer).mockReturnValue(undefined);

    const { result } = await act(async () => renderPrivacySettingsHook());

    await waitFor(() => {
      expect(result.current.privacyState.isLoading).toBe(false);
    });

    expect(result.current.privacyState.error).toBe('Oauth not being used');
  });

  it('should handle paid tier users correctly', async () => {
    // Mock paid tier response
    vi.mocked(getCodeAssistServer).mockReturnValue({
      projectId: 'test-project-id',
      userTier: UserTierId.STANDARD,
    } as unknown as CodeAssistServer);

    const { result } = await act(async () => renderPrivacySettingsHook());

    await waitFor(() => {
      expect(result.current.privacyState.isLoading).toBe(false);
    });

    expect(result.current.privacyState.error).toBeUndefined();
    expect(result.current.privacyState.isFreeTier).toBe(false);
    expect(result.current.privacyState.dataCollectionOptIn).toBeUndefined();
  });

  it('should throw error when CodeAssistServer has no projectId', async () => {
    vi.mocked(getCodeAssistServer).mockReturnValue({
      userTier: UserTierId.FREE,
    } as unknown as CodeAssistServer);

    const { result } = await act(async () => renderPrivacySettingsHook());

    await waitFor(() => {
      expect(result.current.privacyState.isLoading).toBe(false);
    });

    expect(result.current.privacyState.error).toBe(
      'CodeAssist server is missing a project ID',
    );
  });

  it('should update data collection opt-in setting', async () => {
    let deferredGet: { resolve: (val: unknown) => void };
    const mockCodeAssistServer = {
      projectId: 'test-project-id',
      getCodeAssistGlobalUserSetting: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            deferredGet = { resolve };
          }),
      ),
      setCodeAssistGlobalUserSetting: vi.fn().mockResolvedValue({
        freeTierDataCollectionOptin: false,
      }),
      userTier: UserTierId.FREE,
    } as unknown as CodeAssistServer;
    vi.mocked(getCodeAssistServer).mockReturnValue(mockCodeAssistServer);

    const { result } = await act(async () => renderPrivacySettingsHook());

    // Initially loading
    expect(result.current.privacyState.isLoading).toBe(true);

    // Finish initial load
    await act(async () => {
      deferredGet.resolve({
        freeTierDataCollectionOptin: true,
      });
    });

    // Wait for initial load to process
    await waitFor(() => {
      expect(result.current.privacyState.isLoading).toBe(false);
    });

    // Update the setting
    await act(async () => {
      await result.current.updateDataCollectionOptIn(false);
    });

    // Wait for update to complete
    await waitFor(() => {
      expect(result.current.privacyState.dataCollectionOptIn).toBe(false);
    });

    expect(
      mockCodeAssistServer.setCodeAssistGlobalUserSetting,
    ).toHaveBeenCalledWith({
      cloudaicompanionProject: 'test-project-id',
      freeTierDataCollectionOptin: false,
    });
  });
});
