/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Config } from './config.js';
import { coreEvents } from '../utils/events.js';
import { getCodeAssistServer } from '../code_assist/codeAssist.js';
import type { CodeAssistServer } from '../code_assist/server.js';
import {
  createContentGenerator,
  createContentGeneratorConfig,
  AuthType,
  type ContentGenerator,
  type ContentGeneratorConfig,
} from '../core/contentGenerator.js';

// Mock dependencies
vi.mock('../code_assist/codeAssist.js', () => ({
  getCodeAssistServer: vi.fn(),
}));

vi.mock('../code_assist/experiments/client_metadata.js', () => ({
  getClientMetadata: vi.fn().mockResolvedValue({}),
}));

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  },
}));

vi.mock('../core/contentGenerator.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../core/contentGenerator.js')>();
  return {
    ...actual,
    createContentGenerator: vi.fn(),
    createContentGeneratorConfig: vi.fn(),
  };
});

describe('Config Admin Controls Polling', () => {
  let config: Config;
  let mockServer: {
    projectId: string;
    fetchAdminControls: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();

    // Setup mock server as a partial to match strict requirements safely
    mockServer = {
      projectId: 'test-project',
      fetchAdminControls: vi.fn(),
    };
    // Safe cast using unknown to satisfy strict mocking without disabling checks
    // We are mocking internal behavior, so partial compatibility is intentional
    vi.mocked(getCodeAssistServer).mockReturnValue(
      mockServer as unknown as CodeAssistServer,
    );

    // Setup content generator mocks
    vi.mocked(createContentGenerator).mockResolvedValue(
      {} as unknown as ContentGenerator,
    );
    vi.mocked(createContentGeneratorConfig).mockResolvedValue({
      authType: AuthType.USE_GEMINI,
    } as ContentGeneratorConfig);

    // Create config instance with minimal props
    config = new Config({
      sessionId: 'test-session',
      targetDir: '/tmp',
    } as unknown as ConstructorParameters<typeof Config>[0]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should start polling and emit event when settings change', async () => {
    const initialSettings = {
      secureModeEnabled: false,
    };
    const newSettings = {
      secureModeEnabled: true,
    };

    // Setup initial state
    config.setRemoteAdminSettings(initialSettings);

    // Mock server response for polling
    mockServer.fetchAdminControls.mockResolvedValue(newSettings);

    // Spy on event emission
    const emitSpy = vi.spyOn(coreEvents, 'emitAdminSettingsChanged');

    // Start polling via public API
    await config.refreshAuth(AuthType.USE_GEMINI);

    // Fast-forward time
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000); // 5 minutes

    expect(mockServer.fetchAdminControls).toHaveBeenCalled();
    expect(config.getRemoteAdminSettings()).toEqual(newSettings);
    expect(emitSpy).toHaveBeenCalled();
  });

  it('should not emit event when settings are identical', async () => {
    const settings = {
      secureModeEnabled: true,
      mcpSetting: { mcpEnabled: true },
    };

    config.setRemoteAdminSettings(settings);
    mockServer.fetchAdminControls.mockResolvedValue(settings);
    const emitSpy = vi.spyOn(coreEvents, 'emitAdminSettingsChanged');

    await config.refreshAuth(AuthType.USE_GEMINI);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(mockServer.fetchAdminControls).toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should handle fetch errors gracefully', async () => {
    config.setRemoteAdminSettings({ secureModeEnabled: false });
    mockServer.fetchAdminControls.mockRejectedValue(new Error('Fetch failed'));
    const emitSpy = vi.spyOn(coreEvents, 'emitAdminSettingsChanged');

    // Trigger polling via public API
    await config.refreshAuth(AuthType.USE_GEMINI);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(mockServer.fetchAdminControls).toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
    // Should still have old settings
    expect(config.getRemoteAdminSettings()).toEqual({
      secureModeEnabled: false,
    });
  });

  it('should stop polling when code assist server is not available', async () => {
    // Start polling first
    await config.refreshAuth(AuthType.USE_GEMINI);

    // We can't verify private interval, but we can verify behavior
    // If it's running, it should call fetch
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(1);

    // Mock getCodeAssistServer to return undefined (simulating auth switch)
    vi.mocked(getCodeAssistServer).mockReturnValue(undefined);

    // Call refreshAuth
    await config.refreshAuth(AuthType.USE_GEMINI);

    // Should not call fetch again
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(1);
  });
});
