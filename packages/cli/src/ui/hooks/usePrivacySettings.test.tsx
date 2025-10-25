/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import type {
  Config,
  CodeAssistServer,
  LoadCodeAssistResponse,
} from '@google/gemini-cli-core';
import { UserTierId, getCodeAssistServer } from '@google/gemini-cli-core';
import { usePrivacySettings } from './usePrivacySettings.js';

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

  const renderPrivacySettingsHook = () => {
    let hookResult: ReturnType<typeof usePrivacySettings>;
    function TestComponent() {
      hookResult = usePrivacySettings(mockConfig);
      return null;
    }
    render(<TestComponent />);
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

    const { result } = renderPrivacySettingsHook();

    await vi.waitFor(() => {
      expect(result.current.privacyState.isLoading).toBe(false);
    });

    expect(result.current.privacyState.error).toBe('Oauth not being used');
  });

  it('should handle paid tier users correctly', async () => {
    // Mock paid tier response
    vi.mocked(getCodeAssistServer).mockReturnValue({
      projectId: 'test-project-id',
      loadCodeAssist: () =>
        ({
          currentTier: { id: UserTierId.STANDARD },
        }) as unknown as LoadCodeAssistResponse,
    } as unknown as CodeAssistServer);

    const { result } = renderPrivacySettingsHook();

    await vi.waitFor(() => {
      expect(result.current.privacyState.isLoading).toBe(false);
    });

    expect(result.current.privacyState.error).toBeUndefined();
    expect(result.current.privacyState.isFreeTier).toBe(false);
    expect(result.current.privacyState.dataCollectionOptIn).toBeUndefined();
  });

  it('should throw error when CodeAssistServer has no projectId', async () => {
    vi.mocked(getCodeAssistServer).mockReturnValue({
      loadCodeAssist: () =>
        ({
          currentTier: { id: UserTierId.FREE },
        }) as unknown as LoadCodeAssistResponse,
    } as unknown as CodeAssistServer);

    const { result } = renderPrivacySettingsHook();

    await vi.waitFor(() => {
      expect(result.current.privacyState.isLoading).toBe(false);
    });

    expect(result.current.privacyState.error).toBe(
      'CodeAssist server is missing a project ID',
    );
  });

  it('should update data collection opt-in setting', async () => {
    const mockCodeAssistServer = {
      projectId: 'test-project-id',
      getCodeAssistGlobalUserSetting: vi.fn().mockResolvedValue({
        freeTierDataCollectionOptin: true,
      }),
      setCodeAssistGlobalUserSetting: vi.fn().mockResolvedValue({
        freeTierDataCollectionOptin: false,
      }),
      loadCodeAssist: () =>
        ({
          currentTier: { id: UserTierId.FREE },
        }) as unknown as LoadCodeAssistResponse,
    } as unknown as CodeAssistServer;
    vi.mocked(getCodeAssistServer).mockReturnValue(mockCodeAssistServer);

    const { result } = renderPrivacySettingsHook();

    // Wait for initial load
    await vi.waitFor(() => {
      expect(result.current.privacyState.isLoading).toBe(false);
    });

    // Update the setting
    await result.current.updateDataCollectionOptIn(false);

    // Wait for update to complete
    await vi.waitFor(() => {
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
