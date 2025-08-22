/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  Config,
  CodeAssistServer,
  LoggingContentGenerator,
  UserTierId,
  GeminiClient,
  ContentGenerator,
} from '@google/gemini-cli-core';
import { OAuth2Client } from 'google-auth-library';
import { usePrivacySettings } from './usePrivacySettings.js';

// Mock the dependencies
vi.mock('@google/gemini-cli-core', () => {
  // Mock classes for instanceof checks
  class MockCodeAssistServer {
    projectId = 'test-project-id';
    loadCodeAssist = vi.fn();
    getCodeAssistGlobalUserSetting = vi.fn();
    setCodeAssistGlobalUserSetting = vi.fn();

    constructor(
      _client?: GeminiClient,
      _projectId?: string,
      _httpOptions?: Record<string, unknown>,
      _sessionId?: string,
      _userTier?: UserTierId,
    ) {}
  }

  class MockLoggingContentGenerator {
    getWrapped = vi.fn();

    constructor(
      _wrapped?: ContentGenerator,
      _config?: Record<string, unknown>,
    ) {}
  }

  return {
    Config: vi.fn(),
    CodeAssistServer: MockCodeAssistServer,
    LoggingContentGenerator: MockLoggingContentGenerator,
    GeminiClient: vi.fn(),
    UserTierId: {
      FREE: 'free-tier',
      LEGACY: 'legacy-tier',
      STANDARD: 'standard-tier',
    },
  };
});

describe('usePrivacySettings', () => {
  let mockConfig: Config;
  let mockClient: GeminiClient;
  let mockCodeAssistServer: CodeAssistServer;
  let mockLoggingContentGenerator: LoggingContentGenerator;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock CodeAssistServer instance
    mockCodeAssistServer = new CodeAssistServer(
      null as unknown as OAuth2Client,
      'test-project-id',
    ) as unknown as CodeAssistServer;
    (
      mockCodeAssistServer.loadCodeAssist as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      currentTier: { id: UserTierId.FREE },
    });
    (
      mockCodeAssistServer.getCodeAssistGlobalUserSetting as ReturnType<
        typeof vi.fn
      >
    ).mockResolvedValue({
      freeTierDataCollectionOptin: true,
    });
    (
      mockCodeAssistServer.setCodeAssistGlobalUserSetting as ReturnType<
        typeof vi.fn
      >
    ).mockResolvedValue({
      freeTierDataCollectionOptin: false,
    });

    // Create mock LoggingContentGenerator that wraps the CodeAssistServer
    mockLoggingContentGenerator = new LoggingContentGenerator(
      mockCodeAssistServer,
      null as unknown as Config,
    ) as unknown as LoggingContentGenerator;
    (
      mockLoggingContentGenerator.getWrapped as ReturnType<typeof vi.fn>
    ).mockReturnValue(mockCodeAssistServer);

    // Create mock GeminiClient
    mockClient = {
      getContentGenerator: vi.fn().mockReturnValue(mockLoggingContentGenerator),
    } as unknown as GeminiClient;

    // Create mock Config
    mockConfig = {
      getGeminiClient: vi.fn().mockReturnValue(mockClient),
    } as unknown as Config;
  });

  it('should handle LoggingContentGenerator wrapper correctly and not throw "Oauth not being used" error', async () => {
    const { result } = renderHook(() => usePrivacySettings(mockConfig));

    // Initial state should be loading
    expect(result.current.privacyState.isLoading).toBe(true);
    expect(result.current.privacyState.error).toBeUndefined();

    // Wait for the hook to complete
    await waitFor(() => {
      expect(result.current.privacyState.isLoading).toBe(false);
    });

    // Should not have the "Oauth not being used" error
    expect(result.current.privacyState.error).toBeUndefined();
    expect(result.current.privacyState.isFreeTier).toBe(true);
    expect(result.current.privacyState.dataCollectionOptIn).toBe(true);

    // Verify that getWrapped was called to unwrap the LoggingContentGenerator
    expect(mockLoggingContentGenerator.getWrapped).toHaveBeenCalled();
  });

  it('should work with direct CodeAssistServer (no wrapper)', async () => {
    // Test case where the content generator is directly a CodeAssistServer
    const directServer = new CodeAssistServer(
      null as unknown as OAuth2Client,
      'test-project-id',
    ) as unknown as CodeAssistServer;
    (directServer.loadCodeAssist as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        currentTier: { id: UserTierId.FREE },
      },
    );
    (
      directServer.getCodeAssistGlobalUserSetting as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      freeTierDataCollectionOptin: true,
    });

    mockClient.getContentGenerator = vi.fn().mockReturnValue(directServer);

    const { result } = renderHook(() => usePrivacySettings(mockConfig));

    await waitFor(() => {
      expect(result.current.privacyState.isLoading).toBe(false);
    });

    expect(result.current.privacyState.error).toBeUndefined();
    expect(result.current.privacyState.isFreeTier).toBe(true);
    expect(result.current.privacyState.dataCollectionOptIn).toBe(true);
  });

  it('should handle paid tier users correctly', async () => {
    // Mock paid tier response
    (
      mockCodeAssistServer.loadCodeAssist as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      currentTier: { id: UserTierId.STANDARD },
    });

    const { result } = renderHook(() => usePrivacySettings(mockConfig));

    await waitFor(() => {
      expect(result.current.privacyState.isLoading).toBe(false);
    });

    expect(result.current.privacyState.error).toBeUndefined();
    expect(result.current.privacyState.isFreeTier).toBe(false);
    expect(result.current.privacyState.dataCollectionOptIn).toBeUndefined();
  });

  it('should throw error when content generator is not a CodeAssistServer', async () => {
    // Mock a non-CodeAssistServer content generator
    const mockOtherGenerator = { someOtherMethod: vi.fn() };
    (
      mockLoggingContentGenerator.getWrapped as ReturnType<typeof vi.fn>
    ).mockReturnValue(mockOtherGenerator);

    const { result } = renderHook(() => usePrivacySettings(mockConfig));

    await waitFor(() => {
      expect(result.current.privacyState.isLoading).toBe(false);
    });

    expect(result.current.privacyState.error).toBe('Oauth not being used');
  });

  it('should throw error when CodeAssistServer has no projectId', async () => {
    // Mock CodeAssistServer without projectId
    const mockServerNoProject = {
      ...mockCodeAssistServer,
      projectId: undefined,
    };
    (
      mockLoggingContentGenerator.getWrapped as ReturnType<typeof vi.fn>
    ).mockReturnValue(mockServerNoProject);

    const { result } = renderHook(() => usePrivacySettings(mockConfig));

    await waitFor(() => {
      expect(result.current.privacyState.isLoading).toBe(false);
    });

    expect(result.current.privacyState.error).toBe('Oauth not being used');
  });

  it('should update data collection opt-in setting', async () => {
    const { result } = renderHook(() => usePrivacySettings(mockConfig));

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.privacyState.isLoading).toBe(false);
    });

    // Update the setting
    await result.current.updateDataCollectionOptIn(false);

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
