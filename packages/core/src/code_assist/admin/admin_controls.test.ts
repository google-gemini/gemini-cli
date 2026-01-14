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
} from './admin_controls.js';
import type { CodeAssistServer } from '../server.js';
import { ExperimentFlags } from '../experiments/flagNames.js';
import * as experiments from '../experiments/experiments.js';

// Mock dependencies
vi.mock('../experiments/experiments.js');

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
    it('should return empty object for null/undefined', () => {
      expect(sanitizeAdminSettings(null)).toEqual({});
      expect(sanitizeAdminSettings(undefined)).toEqual({});
    });

    it('should strip unknown fields', () => {
      const input = {
        secureModeEnabled: true,
        extraField: 'should be removed',
        mcpSetting: {
          mcpEnabled: false,
          unknownMcpField: 'remove me',
        },
      };

      const result = sanitizeAdminSettings(input);

      expect(result).toEqual({
        secureModeEnabled: true,
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
    beforeEach(() => {
      // Default: Experiment enabled
      vi.mocked(experiments.getExperiments).mockResolvedValue({
        experimentIds: [ExperimentFlags.ENABLE_ADMIN_CONTROLS],
        flags: {},
      });
    });

    it('should return fallback settings immediately if server is missing', async () => {
      const fallback = { secureModeEnabled: true };
      const result = await fetchAdminControls(
        undefined,
        mockOnSettingsChanged,
        fallback,
      );
      expect(result).toEqual(fallback);
    });

    it('should use fallback settings and skip initial fetch if fallback is provided (IPC case)', async () => {
      const fallback = { secureModeEnabled: true };
      const result = await fetchAdminControls(
        mockServer,
        mockOnSettingsChanged,
        fallback,
      );

      expect(result).toEqual(fallback);
      expect(mockServer.fetchAdminControls).not.toHaveBeenCalled();

      // Should still start polling
      // Fast forward to first poll interval
      (mockServer.fetchAdminControls as Mock).mockResolvedValue({
        secureModeEnabled: false,
      });
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000); // 30 min default

      expect(mockServer.fetchAdminControls).toHaveBeenCalled();
    });

    it('should return empty object if experiment is disabled', async () => {
      vi.mocked(experiments.getExperiments).mockResolvedValue({
        experimentIds: [],
        flags: {},
      });
      const result = await fetchAdminControls(
        mockServer,
        mockOnSettingsChanged,
      );
      expect(result).toEqual({});
      expect(mockServer.fetchAdminControls).not.toHaveBeenCalled();
    });

    it('should fetch from server if no fallback provided', async () => {
      const serverResponse = { secureModeEnabled: true };
      (mockServer.fetchAdminControls as Mock).mockResolvedValue(serverResponse);

      const result = await fetchAdminControls(
        mockServer,
        mockOnSettingsChanged,
      );
      expect(result).toEqual(serverResponse);
      expect(mockServer.fetchAdminControls).toHaveBeenCalledTimes(1);
    });

    it('should return fallback on fetch error', async () => {
      (mockServer.fetchAdminControls as Mock).mockRejectedValue(
        new Error('Network error'),
      );
      const result = await fetchAdminControls(
        mockServer,
        mockOnSettingsChanged,
        { secureModeEnabled: false },
      );

      expect(result).toEqual({ secureModeEnabled: false });
    });

    it('should sanitize server response', async () => {
      (mockServer.fetchAdminControls as Mock).mockResolvedValue({
        secureModeEnabled: true,
        unknownField: 'bad',
      });

      const result = await fetchAdminControls(
        mockServer,
        mockOnSettingsChanged,
      );
      expect(result).toEqual({ secureModeEnabled: true });
      expect(
        (result as Record<string, unknown>)['unknownField'],
      ).toBeUndefined();
    });
  });

  describe('polling', () => {
    it('should poll and emit changes', async () => {
      vi.mocked(experiments.getExperiments).mockResolvedValue({
        experimentIds: [ExperimentFlags.ENABLE_ADMIN_CONTROLS],
        flags: {},
      });
      // Initial fetch
      (mockServer.fetchAdminControls as Mock).mockResolvedValue({
        secureModeEnabled: false,
      });
      await fetchAdminControls(mockServer, mockOnSettingsChanged);

      // Update for next poll
      (mockServer.fetchAdminControls as Mock).mockResolvedValue({
        secureModeEnabled: true,
      });

      // Fast forward
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

      expect(mockOnSettingsChanged).toHaveBeenCalledWith({
        secureModeEnabled: true,
      });
    });

    it('should NOT emit if settings are identical', async () => {
      vi.mocked(experiments.getExperiments).mockResolvedValue({
        experimentIds: [ExperimentFlags.ENABLE_ADMIN_CONTROLS],
        flags: {},
      });
      const settings = { secureModeEnabled: true };
      (mockServer.fetchAdminControls as Mock).mockResolvedValue(settings);

      await fetchAdminControls(mockServer, mockOnSettingsChanged);

      // Next poll returns same
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

      expect(mockOnSettingsChanged).not.toHaveBeenCalled();
    });
  });
});
