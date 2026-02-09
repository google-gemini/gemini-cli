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
  fetchAdminControlsOnce,
  sanitizeAdminSettings,
  stopAdminControlsPolling,
  getAdminErrorMessage,
  getAdminBlockedMcpServersMessage,
} from './admin_controls.js';
import type { CodeAssistServer } from '../server.js';
import type { Config } from '../../config/config.js';
import { getCodeAssistServer } from '../codeAssist.js';
import type {
  FetchAdminControlsResponse,
  AdminControlsSettings,
} from '../types.js';

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
        cliFeatureSetting: {
          extensionsSetting: { extensionsEnabled: false },
          unmanagedCapabilitiesEnabled: false,
        },
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
        mcpConfig: {},
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
        mcpConfig: {},
      });
    });

    it('should apply default values when fields are missing', () => {
      const input = {};
      const result = sanitizeAdminSettings(input as FetchAdminControlsResponse);

      expect(result).toEqual({
        strictModeDisabled: false,
        cliFeatureSetting: {
          extensionsSetting: { extensionsEnabled: false },
          unmanagedCapabilitiesEnabled: false,
        },
        mcpSetting: {
          mcpEnabled: false,
          mcpConfig: {},
        },
      });
    });

    it('should default mcpEnabled to false if mcpSetting is present but mcpEnabled is undefined', () => {
      const input = { mcpSetting: {} };
      const result = sanitizeAdminSettings(input as FetchAdminControlsResponse);
      expect(result.mcpSetting?.mcpEnabled).toBe(false);
      expect(result.mcpSetting?.mcpConfig).toEqual({});
    });

    it('should default extensionsEnabled to false if extensionsSetting is present but extensionsEnabled is undefined', () => {
      const input = {
        cliFeatureSetting: {
          extensionsSetting: {},
        },
      };
      const result = sanitizeAdminSettings(input as FetchAdminControlsResponse);
      expect(
        result.cliFeatureSetting?.extensionsSetting?.extensionsEnabled,
      ).toBe(false);
    });

    it('should default unmanagedCapabilitiesEnabled to false if cliFeatureSetting is present but unmanagedCapabilitiesEnabled is undefined', () => {
      const input = {
        cliFeatureSetting: {},
      };
      const result = sanitizeAdminSettings(input as FetchAdminControlsResponse);
      expect(result.cliFeatureSetting?.unmanagedCapabilitiesEnabled).toBe(
        false,
      );
    });

    it('should reflect explicit values', () => {
      const input: FetchAdminControlsResponse = {
        strictModeDisabled: true,
        cliFeatureSetting: {
          extensionsSetting: { extensionsEnabled: true },
          unmanagedCapabilitiesEnabled: true,
        },
        mcpSetting: {
          mcpEnabled: true,
        },
      };

      const result = sanitizeAdminSettings(input);

      expect(result).toEqual({
        strictModeDisabled: true,
        cliFeatureSetting: {
          extensionsSetting: { extensionsEnabled: true },
          unmanagedCapabilitiesEnabled: true,
        },
        mcpSetting: {
          mcpEnabled: true,
          mcpConfig: {},
        },
      });
    });

    it('should prioritize strictModeDisabled over secureModeEnabled', () => {
      const input: FetchAdminControlsResponse = {
        strictModeDisabled: true,
        secureModeEnabled: true, // Should be ignored because strictModeDisabled takes precedence for backwards compatibility if both exist (though usually they shouldn't)
      };

      const result = sanitizeAdminSettings(input);
      expect(result.strictModeDisabled).toBe(true);
    });

    it('should use secureModeEnabled if strictModeDisabled is undefined', () => {
      const input: FetchAdminControlsResponse = {
        secureModeEnabled: false,
      };

      const result = sanitizeAdminSettings(input);
      expect(result.strictModeDisabled).toBe(true);
    });
  });

  describe('isDeepStrictEqual verification', () => {
    it('should consider AdminControlsSettings with different key orders as equal', () => {
      const settings1: AdminControlsSettings = {
        strictModeDisabled: false,
        mcpSetting: { mcpEnabled: true },
        cliFeatureSetting: { unmanagedCapabilitiesEnabled: true },
      };
      const settings2: AdminControlsSettings = {
        cliFeatureSetting: { unmanagedCapabilitiesEnabled: true },
        mcpSetting: { mcpEnabled: true },
        strictModeDisabled: false,
      };
      expect(isDeepStrictEqual(settings1, settings2)).toBe(true);
    });

    it('should consider nested settings objects with different key orders as equal', () => {
      const settings1: AdminControlsSettings = {
        mcpSetting: {
          mcpEnabled: true,
          mcpConfig: {
            mcpServers: {
              server1: { url: 'url', type: 'sse' },
            },
          },
        },
      };

      // Order swapped in mcpConfig and mcpServers items
      const settings2: AdminControlsSettings = {
        mcpSetting: {
          mcpConfig: {
            mcpServers: {
              server1: { type: 'sse', url: 'url' },
            },
          },
          mcpEnabled: true,
        },
      };
      expect(isDeepStrictEqual(settings1, settings2)).toBe(true);
    });

    it('should consider arrays in options as order-independent and equal if shuffled after sanitization', () => {
      const mcpConfig1 = {
        mcpServers: {
          server1: { includeTools: ['a', 'b'] },
        },
      };
      const mcpConfig2 = {
        mcpServers: {
          server1: { includeTools: ['b', 'a'] },
        },
      };

      const settings1 = sanitizeAdminSettings({
        mcpSetting: {
          mcpEnabled: true,
          mcpConfigJson: JSON.stringify(mcpConfig1),
        },
      });
      const settings2 = sanitizeAdminSettings({
        mcpSetting: {
          mcpEnabled: true,
          mcpConfigJson: JSON.stringify(mcpConfig2),
        },
      });

      expect(isDeepStrictEqual(settings1, settings2)).toBe(true);
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
      const cachedSettings = {
        strictModeDisabled: false,
        mcpSetting: { mcpEnabled: false, mcpConfig: {} },
        cliFeatureSetting: {
          extensionsSetting: { extensionsEnabled: false },
          unmanagedCapabilitiesEnabled: false,
        },
      };
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
        cliFeatureSetting: {
          extensionsSetting: { extensionsEnabled: false },
          unmanagedCapabilitiesEnabled: false,
        },
        mcpSetting: {
          mcpEnabled: false,
          mcpConfig: {},
        },
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
        cliFeatureSetting: {
          extensionsSetting: { extensionsEnabled: false },
          unmanagedCapabilitiesEnabled: false,
        },
        mcpSetting: {
          mcpEnabled: false,
          mcpConfig: {},
        },
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

  describe('fetchAdminControlsOnce', () => {
    it('should return empty object if server is missing', async () => {
      const result = await fetchAdminControlsOnce(undefined, true);
      expect(result).toEqual({});
      expect(mockServer.fetchAdminControls).not.toHaveBeenCalled();
    });

    it('should return empty object if project ID is missing', async () => {
      mockServer = {
        fetchAdminControls: vi.fn(),
      } as unknown as CodeAssistServer;
      const result = await fetchAdminControlsOnce(mockServer, true);
      expect(result).toEqual({});
      expect(mockServer.fetchAdminControls).not.toHaveBeenCalled();
    });

    it('should return empty object if admin controls are disabled', async () => {
      const result = await fetchAdminControlsOnce(mockServer, false);
      expect(result).toEqual({});
      expect(mockServer.fetchAdminControls).not.toHaveBeenCalled();
    });

    it('should fetch from server and sanitize the response', async () => {
      const serverResponse = {
        strictModeDisabled: true,
        unknownField: 'should be removed',
      };
      (mockServer.fetchAdminControls as Mock).mockResolvedValue(serverResponse);

      const result = await fetchAdminControlsOnce(mockServer, true);
      expect(result).toEqual({
        strictModeDisabled: true,
        cliFeatureSetting: {
          extensionsSetting: { extensionsEnabled: false },
          unmanagedCapabilitiesEnabled: false,
        },
        mcpSetting: {
          mcpEnabled: false,
          mcpConfig: {},
        },
      });
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(1);
    });

    it('should return empty object on 403 fetch error', async () => {
      const error403 = new Error('Forbidden');
      Object.assign(error403, { status: 403 });
      (mockServer.fetchAdminControls as Mock).mockRejectedValue(error403);

      const result = await fetchAdminControlsOnce(mockServer, true);
      expect(result).toEqual({});
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(1);
    });

    it('should return empty object on any other fetch error', async () => {
      (mockServer.fetchAdminControls as Mock).mockRejectedValue(
        new Error('Network error'),
      );
      const result = await fetchAdminControlsOnce(mockServer, true);
      expect(result).toEqual({});
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(1);
    });

    it('should not start or stop any polling timers', async () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      (mockServer.fetchAdminControls as Mock).mockResolvedValue({});
      await fetchAdminControlsOnce(mockServer, true);

      expect(setIntervalSpy).not.toHaveBeenCalled();
      expect(clearIntervalSpy).not.toHaveBeenCalled();
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
        cliFeatureSetting: {
          extensionsSetting: { extensionsEnabled: false },
          unmanagedCapabilitiesEnabled: false,
        },
        mcpSetting: {
          mcpEnabled: false,
          mcpConfig: {},
        },
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
        cliFeatureSetting: {
          extensionsSetting: { extensionsEnabled: false },
          unmanagedCapabilitiesEnabled: false,
        },
        mcpSetting: {
          mcpEnabled: false,
          mcpConfig: {},
        },
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

  describe('getAdminBlockedMcpServersMessage', () => {
    let mockConfig: Config;

    beforeEach(() => {
      mockConfig = {} as Config;
    });

    it('should show count for a single blocked server', () => {
      vi.mocked(getCodeAssistServer).mockReturnValue({
        projectId: 'test-project-123',
      } as CodeAssistServer);

      const message = getAdminBlockedMcpServersMessage(
        ['server-1'],
        mockConfig,
      );

      expect(message).toBe(
        '1 MCP server is not allowlisted by your administrator. To enable it, please request an update to the settings at: https://goo.gle/manage-gemini-cli?project=test-project-123',
      );
    });

    it('should show count for multiple blocked servers', () => {
      vi.mocked(getCodeAssistServer).mockReturnValue({
        projectId: 'test-project-123',
      } as CodeAssistServer);

      const message = getAdminBlockedMcpServersMessage(
        ['server-1', 'server-2', 'server-3'],
        mockConfig,
      );

      expect(message).toBe(
        '3 MCP servers are not allowlisted by your administrator. To enable them, please request an update to the settings at: https://goo.gle/manage-gemini-cli?project=test-project-123',
      );
    });

    it('should format message correctly with no project ID', () => {
      vi.mocked(getCodeAssistServer).mockReturnValue(undefined);

      const message = getAdminBlockedMcpServersMessage(
        ['server-1', 'server-2'],
        mockConfig,
      );

      expect(message).toBe(
        '2 MCP servers are not allowlisted by your administrator. To enable them, please request an update to the settings at: https://goo.gle/manage-gemini-cli',
      );
    });
  });
});
