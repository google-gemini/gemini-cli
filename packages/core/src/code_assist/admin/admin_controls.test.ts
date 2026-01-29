/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import {
  fetchAdminControls,
  sanitizeAdminSettings,
  stopAdminControlsPolling,
  getAdminErrorMessage,
} from './admin_controls.js';
import type { CodeAssistServer } from '../server.js';
import type { Config } from '../../config/config.js';
import { getCodeAssistServer } from '../codeAssist.js';

vi.mock('../codeAssist.js', () => ({
  getCodeAssistServer: vi.fn(),
}));

describe('Admin Controls', () => {
  let mockServer: CodeAssistServer;
  let mockOnSettingsChanged: Mock;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();

    mockServer = {
      projectId: 'test-project',
      fetchAdminControls: vi.fn(),
    } as unknown as CodeAssistServer;

    mockOnSettingsChanged = vi.fn();
  });

  afterEach(() => {
    stopAdminControlsPolling();
    vi.useRealTimers();
  });

  describe('sanitizeAdminSettings', () => {
    it('should strip unknown fields', () => {
      const input = {
        strictModeDisabled: false,
        extraField: 'should be removed',
        mcpSetting: {
          mcpEnabled: false,
          unknownMcpField: 'remove me',
        },
      };

      const result = sanitizeAdminSettings(input);

      expect(result).toEqual({
        strictModeDisabled: false,
        mcpSetting: {
          mcpEnabled: false,
        },
      });
      // Explicitly check that unknown fields are gone
      expect((result as Record<string, unknown>)['extraField']).toBeUndefined();
    });

    it('should preserve valid nested fields', () => {
      const input = {
        cliFeatureSetting: {
          extensionsSetting: {
            extensionsEnabled: true,
          },
        },
      };
      expect(sanitizeAdminSettings(input)).toEqual(input);
    });
  });

  describe('fetchAdminControls', () => {
    it('should return empty object and not poll if server is missing', async () => {
      const result = await fetchAdminControls(
        undefined,
        undefined,
        true,
        mockOnSettingsChanged,
      );
      expect(result).toEqual({});
      expect(mockServer.fetchAdminControls).not.toHaveBeenCalled();
    });

    it('should return empty object if project ID is missing', async () => {
      mockServer = {
        fetchAdminControls: vi.fn(),
      } as unknown as CodeAssistServer;

      const result = await fetchAdminControls(
        mockServer,
        undefined,
        true,
        mockOnSettingsChanged,
      );
      expect(result).toEqual({});
      expect(mockServer.fetchAdminControls).not.toHaveBeenCalled();
    });

    it('should use cachedSettings and start polling if provided', async () => {
      const cachedSettings = { strictModeDisabled: false };
      const result = await fetchAdminControls(
        mockServer,
        cachedSettings,
        true,
        mockOnSettingsChanged,
      );

      expect(result).toEqual(cachedSettings);
      expect(mockServer.fetchAdminControls).not.toHaveBeenCalled();

      // Should still start polling
      (mockServer.fetchAdminControls as Mock).mockResolvedValue({
        strictModeDisabled: true,
      });
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(1);
    });

    it('should return empty object if admin controls are disabled', async () => {
      const result = await fetchAdminControls(
        mockServer,
        undefined,
        false,
        mockOnSettingsChanged,
      );
      expect(result).toEqual({});
      expect(mockServer.fetchAdminControls).not.toHaveBeenCalled();
    });

    it('should fetch from server if no cachedSettings provided', async () => {
      const serverResponse = { strictModeDisabled: false };
      (mockServer.fetchAdminControls as Mock).mockResolvedValue(serverResponse);

      const result = await fetchAdminControls(
        mockServer,
        undefined,
        true,
        mockOnSettingsChanged,
      );
      expect(result).toEqual(serverResponse);
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(1);
    });

    it('should return empty object on fetch error and still start polling', async () => {
      (mockServer.fetchAdminControls as Mock).mockRejectedValue(
        new Error('Network error'),
      );
      const result = await fetchAdminControls(
        mockServer,
        undefined,
        true,
        mockOnSettingsChanged,
      );

      expect(result).toEqual({});

      // Polling should have been started and should retry
      (mockServer.fetchAdminControls as Mock).mockResolvedValue({
        strictModeDisabled: false,
      });
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(2); // Initial + poll
    });

    it('should return empty object on 403 fetch error and STOP polling', async () => {
      const error403 = new Error('Forbidden');
      Object.assign(error403, { status: 403 });
      (mockServer.fetchAdminControls as Mock).mockRejectedValue(error403);

      const result = await fetchAdminControls(
        mockServer,
        undefined,
        true,
        mockOnSettingsChanged,
      );

      expect(result).toEqual({});

      // Advance time - should NOT poll because of 403
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(1); // Only the initial call
    });

    it('should sanitize server response', async () => {
      (mockServer.fetchAdminControls as Mock).mockResolvedValue({
        strictModeDisabled: false,
        unknownField: 'bad',
      });

      const result = await fetchAdminControls(
        mockServer,
        undefined,
        true,
        mockOnSettingsChanged,
      );
      expect(result).toEqual({ strictModeDisabled: false });
      expect(
        (result as Record<string, unknown>)['unknownField'],
      ).toBeUndefined();
    });

    it('should reset polling interval if called again', async () => {
      (mockServer.fetchAdminControls as Mock).mockResolvedValue({});

      // First call
      await fetchAdminControls(
        mockServer,
        undefined,
        true,
        mockOnSettingsChanged,
      );
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(1);

      // Advance time, but not enough to trigger the poll
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);

      // Second call, should reset the timer
      await fetchAdminControls(
        mockServer,
        undefined,
        true,
        mockOnSettingsChanged,
      );
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(2);

      // Advance time by 3 mins. If timer wasn't reset, it would have fired (2+3=5)
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(2); // No new poll

      // Advance time by another 2 mins. Now it should fire.
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(3); // Poll fires
    });
  });

  describe('polling', () => {
    it('should poll and emit changes', async () => {
      // Initial fetch
      (mockServer.fetchAdminControls as Mock).mockResolvedValue({
        strictModeDisabled: true,
      });
      await fetchAdminControls(
        mockServer,
        undefined,
        true,
        mockOnSettingsChanged,
      );

      // Update for next poll
      (mockServer.fetchAdminControls as Mock).mockResolvedValue({
        strictModeDisabled: false,
      });

      // Fast forward
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(mockOnSettingsChanged).toHaveBeenCalledWith({
        strictModeDisabled: false,
      });
    });

    it('should NOT emit if settings are deeply equal but not the same instance', async () => {
      const settings = { strictModeDisabled: false };
      (mockServer.fetchAdminControls as Mock).mockResolvedValue(settings);

      await fetchAdminControls(
        mockServer,
        undefined,
        true,
        mockOnSettingsChanged,
      );
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(1);
      mockOnSettingsChanged.mockClear();

      // Next poll returns a different object with the same values
      (mockServer.fetchAdminControls as Mock).mockResolvedValue({
        strictModeDisabled: false,
      });
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(mockOnSettingsChanged).not.toHaveBeenCalled();
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(2);
    });

    it('should continue polling after a fetch error', async () => {
      // Initial fetch is successful
      (mockServer.fetchAdminControls as Mock).mockResolvedValue({
        strictModeDisabled: true,
      });
      await fetchAdminControls(
        mockServer,
        undefined,
        true,
        mockOnSettingsChanged,
      );
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(1);

      // Next poll fails
      (mockServer.fetchAdminControls as Mock).mockRejectedValue(
        new Error('Poll failed'),
      );
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(2);
      expect(mockOnSettingsChanged).not.toHaveBeenCalled(); // No changes on error

      // Subsequent poll succeeds with new data
      (mockServer.fetchAdminControls as Mock).mockResolvedValue({
        strictModeDisabled: false,
      });
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(3);
      expect(mockOnSettingsChanged).toHaveBeenCalledWith({
        strictModeDisabled: false,
      });
    });

    it('should STOP polling if server returns 403', async () => {
      // Initial fetch is successful
      (mockServer.fetchAdminControls as Mock).mockResolvedValue({
        strictModeDisabled: true,
      });
      await fetchAdminControls(
        mockServer,
        undefined,
        true,
        mockOnSettingsChanged,
      );
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(1);

      // Next poll returns 403
      const error403 = new Error('Forbidden');
      Object.assign(error403, { status: 403 });
      (mockServer.fetchAdminControls as Mock).mockRejectedValue(error403);

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(2);

      // Advance time again - should NOT poll again
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(2);
    });
  });

  describe('stopAdminControlsPolling', () => {
    it('should stop polling after it has started', async () => {
      (mockServer.fetchAdminControls as Mock).mockResolvedValue({});

      // Start polling
      await fetchAdminControls(
        mockServer,
        undefined,
        true,
        mockOnSettingsChanged,
      );
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(1);

      // Stop polling
      stopAdminControlsPolling();

      // Advance timer well beyond the polling interval
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

      // The poll should not have fired again
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(1);
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAdminErrorMessage', () => {
    let mockConfig: Config;

    beforeEach(() => {
      mockConfig = {} as Config;
    });

    it('should include feature name and project ID when present', () => {
      vi.mocked(getCodeAssistServer).mockReturnValue({
        projectId: 'test-project-123',
      } as CodeAssistServer);

      const message = getAdminErrorMessage('Code Completion', mockConfig);

      expect(message).toBe(
        'Code Completion is disabled by your administrator. To enable it, please request an update to the settings at: https://goo.gle/manage-gemini-cli?project=test-project-123',
      );
    });

    it('should include feature name but OMIT project ID when missing', () => {
      vi.mocked(getCodeAssistServer).mockReturnValue({
        projectId: undefined,
      } as CodeAssistServer);

      const message = getAdminErrorMessage('Chat', mockConfig);

      expect(message).toBe(
        'Chat is disabled by your administrator. To enable it, please request an update to the settings at: https://goo.gle/manage-gemini-cli',
      );
    });

    it('should include feature name but OMIT project ID when server is undefined', () => {
      vi.mocked(getCodeAssistServer).mockReturnValue(undefined);

      const message = getAdminErrorMessage('Chat', mockConfig);

      expect(message).toBe(
        'Chat is disabled by your administrator. To enable it, please request an update to the settings at: https://goo.gle/manage-gemini-cli',
      );
    });

    it('should include feature name but OMIT project ID when config is undefined', () => {
      const message = getAdminErrorMessage('Chat', undefined);

      expect(message).toBe(
        'Chat is disabled by your administrator. To enable it, please request an update to the settings at: https://goo.gle/manage-gemini-cli',
      );
    });
  });
});
