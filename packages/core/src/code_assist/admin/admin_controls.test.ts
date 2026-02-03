/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { isDeepStrictEqual } from 'node:util';
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
import type { FetchAdminControlsResponse } from '../types.js';

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
    it('should strip unknown fields and pass through mcpConfigJson when valid', () => {
      const mcpConfig = {
        mcpServers: {
          'server-1': {
            url: 'http://example.com',
            type: 'sse' as const,
            trust: true,
            includeTools: ['tool1'],
          },
        },
      };

      const input = {
        strictModeDisabled: false,
        extraField: 'should be removed',
        mcpSetting: {
          mcpEnabled: true,
          mcpConfigJson: JSON.stringify(mcpConfig),
          unknownMcpField: 'remove me',
        },
      };

      const result = sanitizeAdminSettings(
        input as unknown as FetchAdminControlsResponse,
      );

      expect(result).toEqual({
        strictModeDisabled: false,
        mcpSetting: {
          mcpEnabled: true,
          mcpConfig,
        },
      });
    });

    it('should ignore mcpConfigJson if it is invalid JSON', () => {
      const input: FetchAdminControlsResponse = {
        mcpSetting: {
          mcpEnabled: true,
          mcpConfigJson: '{ invalid json }',
        },
      };

      const result = sanitizeAdminSettings(input);
      expect(result.mcpSetting).toEqual({
        mcpEnabled: true,
        mcpConfig: undefined,
      });
    });

    it('should ignore mcpConfigJson if it does not match schema', () => {
      const invalidConfig = {
        mcpServers: {
          'server-1': {
            url: 123, // should be string
            type: 'invalid-type', // should be sse or http
          },
        },
      };
      const input: FetchAdminControlsResponse = {
        mcpSetting: {
          mcpEnabled: true,
          mcpConfigJson: JSON.stringify(invalidConfig),
        },
      };

      const result = sanitizeAdminSettings(input);
      expect(result.mcpSetting).toEqual({
        mcpEnabled: true,
        mcpConfig: undefined,
      });
    });

    it('should handle undefined mcpSetting', () => {
      const input: FetchAdminControlsResponse = {
        strictModeDisabled: true,
      };

      const result = sanitizeAdminSettings(input);
      expect(result).toEqual({
        strictModeDisabled: true,
        cliFeatureSetting: undefined,
        mcpSetting: undefined,
        secureModeEnabled: undefined,
      });
    });

    it('should handle missing mcpConfigJson', () => {
      const input: FetchAdminControlsResponse = {
        mcpSetting: {
          mcpEnabled: true,
        },
      };

      const result = sanitizeAdminSettings(input);
      expect(result.mcpSetting).toEqual({
        mcpEnabled: true,
        mcpConfig: undefined,
      });
    });
  });

  describe('isDeepStrictEqual verification', () => {
    it('should consider objects with different key orders as equal', () => {
      const obj1 = { a: 1, b: 2 };
      const obj2 = { b: 2, a: 1 };
      expect(isDeepStrictEqual(obj1, obj2)).toBe(true);
    });

    it('should consider nested objects with different key orders as equal', () => {
      const obj1 = { outer: { a: 1, b: 2 } };
      const obj2 = { outer: { b: 2, a: 1 } };
      expect(isDeepStrictEqual(obj1, obj2)).toBe(true);
    });

    it('should consider arrays with different order as NOT equal', () => {
      const arr1 = [1, 2];
      const arr2 = [2, 1];
      expect(isDeepStrictEqual(arr1, arr2)).toBe(false);
    });

    it('should consider objects inside arrays with different key orders as equal', () => {
      const list1 = [{ a: 1, b: 2 }];
      const list2 = [{ b: 2, a: 1 }];
      expect(isDeepStrictEqual(list1, list2)).toBe(true);
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
      expect(result).toEqual({
        strictModeDisabled: false,
        cliFeatureSetting: undefined,
        mcpSetting: undefined,
        secureModeEnabled: undefined,
      });
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
      expect(result).toEqual({
        strictModeDisabled: false,
        cliFeatureSetting: undefined,
        mcpSetting: undefined,
        secureModeEnabled: undefined,
      });
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
        cliFeatureSetting: undefined,
        mcpSetting: undefined,
        secureModeEnabled: undefined,
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
